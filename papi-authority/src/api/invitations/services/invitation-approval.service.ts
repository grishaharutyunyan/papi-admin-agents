import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource, In } from 'typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuditService } from '$/api/audit/services/audit.service';
import type {
  ApproveInvitationDto,
  RejectInvitationDto,
} from '$/api/invitations/dto/approve-invitation.dto';
import { InvitationEntity } from '$/api/invitations/entities/invitation.entity';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType, InvitationStatus } from '$/constants/enums/domain.enums';
import type { PaginatedResult, PaginationQueryDto } from '$/core/http/pagination.dto';
import { pageParams, paginated } from '$/core/http/pagination.dto';

import type { EntityManager } from 'typeorm';

export interface ApprovedIdentity {
  userId: string;
  email: string;
  username: string;
}

/**
 * The ONLY code path that creates an identity (dossier 0.8 / 0.24).
 *
 * Runs entirely on the CONSOLE connection, which is what makes it atomic. The
 * whole act — read the accepted invitation, create the `users` row, apply the
 * role / project / panel grants, write the audit event, delete the invitation —
 * is one transaction on one connection (dossier 0.44).
 *
 * That last part is why the console was granted `INSERT` on `auth_audit_events`.
 * The alternative, auditing over the authority connection, cannot join this
 * transaction: a crash between the two steps would leave a durable
 * "invitation.approved" event for a user that was never created. An audit trail
 * that lies is a worse outcome than one the console may append to — it can add
 * rows, but `UPDATE` and `DELETE` on the trail remain denied, so it still cannot
 * cover its tracks.
 */
@Injectable()
export class InvitationApprovalService {
  constructor(
    @InjectDataSource(DataSourceName.Console)
    private readonly console: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Pending approvals — accepted invitations awaiting an administrator. */
  async listPending(query: PaginationQueryDto): Promise<PaginatedResult<PendingInvitation>> {
    const { skip, take } = pageParams(query);

    const builder = this.console
      .getRepository(InvitationEntity)
      .createQueryBuilder('invitation')
      .leftJoinAndSelect('invitation.role', 'role')
      .leftJoinAndSelect('invitation.projects', 'project')
      .leftJoinAndSelect('invitation.adminPanels', 'adminPanel')
      .where('invitation.status = :status', { status: InvitationStatus.Accepted })
      .orderBy('invitation.accepted_at', query.order ?? 'DESC')
      .skip(skip)
      .take(take);

    if (query.search) {
      builder.andWhere('invitation.email LIKE :search', { search: `%${query.search}%` });
    }

    const [rows, total] = await builder.getManyAndCount();

    return paginated(rows.map(toPending), total, query);
  }

  /**
   * Approve — creates the identity.
   *
   * Only an `accepted` invitation may be approved: acceptance is what proves
   * the Azure `oid`, and approving before that would create an account with no
   * verified identity attached to it.
   */
  async approve(
    invitationId: string,
    dto: ApproveInvitationDto,
    actorUserId: string | null,
  ): Promise<ApprovedIdentity> {
    return this.console.transaction(async (manager) => {
      const invitation = await manager.findOne(InvitationEntity, {
        where: { id: invitationId },
        relations: { projects: true, adminPanels: true },
      });

      if (!invitation) throw new NotFoundException('Invitation not found.');

      if (invitation.status !== InvitationStatus.Accepted) {
        throw new BadRequestException(
          'Only an accepted invitation can be approved — the invitee has not completed sign-in yet.',
        );
      }

      // Acceptance always records the oid; a missing one means the row was
      // tampered with or predates the flow. Refuse rather than create an
      // account that can never sign in.
      if (!invitation.acceptedOid) {
        throw new BadRequestException('This invitation carries no verified Azure identity.');
      }

      const username = dto.username ?? defaultUsername(invitation.email);
      await this.assertAvailable(manager, invitation.email, username, invitation.acceptedOid);

      const user = manager.create(UserEntity, {
        email: invitation.email.toLowerCase(),
        username,
        oid: invitation.acceptedOid,
        firstName: invitation.acceptedFirstName,
        lastName: invitation.acceptedLastName,
        language: invitation.acceptedLanguage ?? 'en',
        // SSO-only account: no password at all, rather than an unusable
        // placeholder hash that a future code path might treat as valid.
        password: null,
        isActive: true,
        isSpReset: false,
        roleId: dto.roleId ?? invitation.roleId,
        projects: await this.resolveProjects(manager, dto.projectIds, invitation.projects),
        adminPanels: await this.resolvePanels(manager, dto.adminPanelIds, invitation.adminPanels),
      });

      const saved = await manager.save(user);

      // Written BEFORE the delete (0.24), in the same transaction, so the
      // surviving record of this onboarding cannot be lost with the row.
      await this.audit.recordWith(manager, {
        eventType: AuthEventType.InvitationApproved,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: saved.id,
        metadata: {
          invitationId: invitation.id,
          email: saved.email,
          username: saved.username,
          oid: invitation.acceptedOid,
          roleId: saved.roleId,
          projectIds: saved.projects.map((project) => project.id),
          adminPanelIds: saved.adminPanels.map((panel) => panel.id),
          overridden: {
            role: dto.roleId !== undefined && dto.roleId !== invitation.roleId,
            projects: dto.projectIds !== undefined,
            adminPanels: dto.adminPanelIds !== undefined,
          },
        },
      });

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.UserCreated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: saved.id,
        metadata: { source: 'invitation_approval', invitationId: invitation.id },
      });

      // The row is DELETED, not marked approved (0.24) — the invitations table
      // holds only open onboarding state, and the audit events above are the
      // permanent record. Junction rows go with it via FK CASCADE.
      await manager.delete(InvitationEntity, { id: invitation.id });

      return { userId: saved.id, email: saved.email, username: saved.username };
    });
  }

  /**
   * Reject — deletes the invitation and records why.
   *
   * Symmetric with approval (0.24/0.49): the row is removed rather than marked
   * `rejected`, so `invitations` never accumulates closed history and the email
   * is immediately free to be invited again. The audit event carries the email,
   * the proven oid and the rejecting admin, so nothing is lost.
   */
  async reject(
    invitationId: string,
    dto: RejectInvitationDto,
    actorUserId: string | null,
  ): Promise<void> {
    await this.console.transaction(async (manager) => {
      const invitation = await manager.findOne(InvitationEntity, { where: { id: invitationId } });
      if (!invitation) throw new NotFoundException('Invitation not found.');

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.InvitationRejected,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'invitation',
        targetId: invitation.id,
        metadata: {
          email: invitation.email,
          oid: invitation.acceptedOid,
          status: invitation.status,
          reason: dto.reason ?? null,
        },
      });

      await manager.delete(InvitationEntity, { id: invitation.id });
    });
  }

  /**
   * Fails loudly on a collision instead of silently suffixing the username.
   * An auto-generated `john.smith2` is indistinguishable from a real second
   * John Smith, and an administrator granting permissions to the wrong
   * near-identical account is exactly the mistake worth refusing to enable.
   */
  private async assertAvailable(
    manager: EntityManager,
    email: string,
    username: string,
    oid: string,
  ): Promise<void> {
    const users = manager.getRepository(UserEntity);

    if (await users.findOne({ where: { email: email.toLowerCase() } })) {
      throw new ConflictException('A user with this email already exists.');
    }

    if (await users.findOne({ where: { username } })) {
      throw new ConflictException(
        `The username "${username}" is taken. Supply an explicit username to approve this invitation.`,
      );
    }

    if (await users.findOne({ where: { oid } })) {
      throw new ConflictException('A user with this Azure identity already exists.');
    }
  }

  private async resolveProjects(
    manager: EntityManager,
    override: string[] | undefined,
    preAssigned: ProjectEntity[],
  ): Promise<ProjectEntity[]> {
    if (override === undefined) return preAssigned;
    if (override.length === 0) return [];

    const found = await manager.find(ProjectEntity, { where: { id: In(override) } });
    assertAllResolved(found.length, override.length, 'project');

    return found;
  }

  private async resolvePanels(
    manager: EntityManager,
    override: string[] | undefined,
    preAssigned: AdminPanelEntity[],
  ): Promise<AdminPanelEntity[]> {
    if (override === undefined) return preAssigned;
    if (override.length === 0) return [];

    const found = await manager.find(AdminPanelEntity, { where: { id: In(override) } });
    assertAllResolved(found.length, override.length, 'admin panel');

    return found;
  }
}

export interface PendingInvitation {
  id: string;
  email: string;
  acceptedAt: Date | null;
  roleId: string | null;
  roleName: string | null;
  projectIds: string[];
  adminPanelIds: string[];
}

function toPending(invitation: InvitationEntity): PendingInvitation {
  return {
    id: invitation.id,
    email: invitation.email,
    acceptedAt: invitation.acceptedAt,
    roleId: invitation.roleId,
    roleName: invitation.role?.name ?? null,
    projectIds: invitation.projects.map((project) => project.id),
    adminPanelIds: invitation.adminPanels.map((panel) => panel.id),
  };
}

/**
 * An unresolved id is a 400, never a silent omission. Dropping unknown ids
 * would let a typo produce an account with fewer grants than the approver
 * believed they were granting — and nothing in the response would say so.
 */
function assertAllResolved(found: number, requested: number, label: string): void {
  if (found !== requested) {
    throw new BadRequestException(`One or more ${label} ids do not exist.`);
  }
}

function defaultUsername(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  return localPart.toLowerCase().replace(/[^a-z0-9._-]/g, '');
}
