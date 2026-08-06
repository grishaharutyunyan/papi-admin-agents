import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuditService } from '$/api/audit/services/audit.service';
import type { CreateInvitationDto } from '$/api/invitations/dto/invitation.dto';
import { InvitationEntity } from '$/api/invitations/entities/invitation.entity';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import type { AzureIdentity } from '$/api/sso/services/azure-token-verifier.service';
import { authConfig, coreConfig, mailConfig } from '$/configs/index.configs';
import { DataSourceName, NodeEnv } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType, InvitationStatus } from '$/constants/enums/domain.enums';

const TOKEN_BYTES = 32;

export interface CreatedInvitation {
  id: string;
  email: string;
  expiresAt: Date;
  /** Dev-only (dossier 0.42); undefined in every other environment. */
  token?: string;
}

@Injectable()
export class InvitationService {
  constructor(
    @InjectRepository(InvitationEntity, DataSourceName.Authority)
    private readonly invitations: Repository<InvitationEntity>,
    @InjectRepository(ProjectEntity, DataSourceName.Authority)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(AdminPanelEntity, DataSourceName.Authority)
    private readonly panels: Repository<AdminPanelEntity>,
    private readonly audit: AuditService,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
    @Inject(mailConfig.KEY) private readonly mail: ConfigType<typeof mailConfig>,
    @Inject(coreConfig.KEY) private readonly core: ConfigType<typeof coreConfig>,
  ) {}

  /**
   * Creates an invitation. The raw token is emailed and NEVER stored — only its
   * SHA-256. papi-back stores invite tokens in plaintext, so a database read
   * there yields working invitation links (dossier D.3c).
   */
  async create(dto: CreateInvitationDto, actorUserId: string | null): Promise<CreatedInvitation> {
    const existing = await this.invitations.findOne({
      where: { email: dto.email, status: In([InvitationStatus.Created, InvitationStatus.Sent]) },
    });
    if (existing) {
      throw new BadRequestException('An open invitation already exists for this email.');
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const invitation = this.invitations.create({
      email: dto.email.toLowerCase(),
      tokenHash: hashToken(token),
      status: InvitationStatus.Created,
      expiresAt: new Date(Date.now() + this.auth.invitationTtlHours * 3_600_000),
      invitedByUserId: actorUserId,
      roleId: dto.roleId ?? null,
      projects: dto.projectIds?.length
        ? await this.projects.find({ where: { id: In(dto.projectIds) } })
        : [],
      adminPanels: dto.adminPanelIds?.length
        ? await this.panels.find({ where: { id: In(dto.adminPanelIds) } })
        : [],
    });

    const saved = await this.invitations.save(invitation);

    // Real delivery lands with ACS in a later step; until then the invitation
    // exists and is simply not sent.
    if (this.mail.enabled) {
      saved.status = InvitationStatus.Sent;
      saved.sentAt = new Date();
      await this.invitations.save(saved);
    }

    await this.audit.record({
      eventType: AuthEventType.InvitationCreated,
      outcome: AuthEventOutcome.Success,
      actorUserId,
      targetType: 'invitation',
      targetId: saved.id,
      metadata: { email: saved.email, mailed: this.mail.enabled },
    });

    // A distinct event from creation: delivery is what puts a working link in
    // a mailbox, and "when was this link actually sent" is a question the
    // creation event cannot answer once ACS is wired.
    if (this.mail.enabled) {
      await this.audit.record({
        eventType: AuthEventType.InvitationSent,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'invitation',
        targetId: saved.id,
        metadata: { email: saved.email },
      });
    }

    return {
      id: saved.id,
      email: saved.email,
      expiresAt: saved.expiresAt,
      token: this.devTokenExposure(token),
    };
  }

  /** Validates a token for the join page. Reveals nothing beyond the email. */
  async validate(token: string): Promise<{ email: string; expiresAt: Date }> {
    const invitation = await this.findOpenByToken(token);
    return { email: invitation.email, expiresAt: invitation.expiresAt };
  }

  /**
   * Accept — Azure path only (dossier 0.18).
   *
   * Captures the proven `oid` and profile ONTO THE INVITATION and marks it
   * `accepted`. **No `users` row is created here** (0.8): identity creation is
   * the console's exclusive act at approval, which is precisely why the
   * authority principal needs no INSERT on `users` at all.
   */
  async accept(token: string, identity: AzureIdentity): Promise<{ status: InvitationStatus }> {
    const invitation = await this.findOpenByToken(token);

    // The Azure account must be the one that was invited — otherwise anyone
    // holding the link could claim it with their own account.
    if (invitation.email.toLowerCase() !== identity.email.toLowerCase()) {
      await this.audit.record({
        eventType: AuthEventType.InvitationAccepted,
        outcome: AuthEventOutcome.Denied,
        targetType: 'invitation',
        targetId: invitation.id,
        metadata: { reason: 'email_mismatch' },
      });
      throw new ForbiddenException('This invitation was issued to a different account.');
    }

    invitation.status = InvitationStatus.Accepted;
    invitation.acceptedAt = new Date();
    invitation.acceptedOid = identity.oid;
    invitation.acceptedFirstName = identity.firstName;
    invitation.acceptedLastName = identity.lastName;
    await this.invitations.save(invitation);

    await this.audit.record({
      eventType: AuthEventType.InvitationAccepted,
      outcome: AuthEventOutcome.Success,
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { oid: identity.oid, awaitingApproval: true },
    });

    return { status: invitation.status };
  }

  /**
   * `open_sso` onboarding (dossier 0.8): an uninvited first SSO login creates an
   * ACCEPTED INVITATION pending approval — never a `users` row.
   */
  async createAcceptedFromSso(identity: AzureIdentity): Promise<InvitationEntity> {
    const invitation = this.invitations.create({
      email: identity.email,
      // Self-service acceptance still needs a token column; it is random and
      // never issued to anyone, so the row cannot be "accepted" a second time.
      tokenHash: hashToken(randomBytes(TOKEN_BYTES).toString('base64url')),
      status: InvitationStatus.Accepted,
      expiresAt: new Date(Date.now() + this.auth.invitationTtlHours * 3_600_000),
      acceptedAt: new Date(),
      acceptedOid: identity.oid,
      acceptedFirstName: identity.firstName,
      acceptedLastName: identity.lastName,
    });

    const saved = await this.invitations.save(invitation);

    await this.audit.record({
      eventType: AuthEventType.InvitationAccepted,
      outcome: AuthEventOutcome.Success,
      targetType: 'invitation',
      targetId: saved.id,
      metadata: { source: 'open_sso', oid: identity.oid, awaitingApproval: true },
    });

    return saved;
  }

  async findAcceptedByOid(oid: string): Promise<InvitationEntity | null> {
    return this.invitations.findOne({
      where: { acceptedOid: oid, status: InvitationStatus.Accepted },
    });
  }

  private async findOpenByToken(token: string): Promise<InvitationEntity> {
    const invitation = await this.invitations.findOne({ where: { tokenHash: hashToken(token) } });

    // Unknown and already-used tokens are the same 404 — distinguishing them
    // would confirm that a given token once existed.
    if (!invitation) throw new NotFoundException('Invitation not found.');

    if (
      invitation.status !== InvitationStatus.Created &&
      invitation.status !== InvitationStatus.Sent
    ) {
      throw new NotFoundException('Invitation not found.');
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      invitation.status = InvitationStatus.Expired;
      await this.invitations.save(invitation);
      throw new NotFoundException('Invitation not found.');
    }

    return invitation;
  }

  /**
   * Returns the raw token ONLY when mail is disabled AND the environment is
   * local or test (dossier 0.42). Both conditions are asserted here rather than
   * trusted from configuration, because this hands out a working invitation
   * link — and a prod-like environment reaching this state is a configuration
   * error that must be loud, not silent.
   */
  private devTokenExposure(token: string): string | undefined {
    const isNonProd = this.core.nodeEnv === NodeEnv.Local || this.core.nodeEnv === NodeEnv.Test;

    // Both conditions, checked here rather than trusted from configuration.
    // The stronger guarantee lives at boot: a prod-like environment cannot
    // start with MAIL_ENABLED=0 at all, so this branch is unreachable outside
    // local/test regardless of what any caller does.
    return this.mail.enabled || !isNonProd ? undefined : token;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
