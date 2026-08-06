import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource, In, IsNull, Not } from 'typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuditService } from '$/api/audit/services/audit.service';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import type {
  CreateUserDto,
  SetActiveDto,
  SetTemporaryPasswordDto,
  UnauthorizeUserDto,
  UpdateUserAccessDto,
  UpdateUserDto,
  UserQueryDto,
} from '$/api/users/dto/user.dto';
import { UserRoleEntity } from '$/api/users/entities/user-role.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { SessionRevocationService } from '$/api/users/services/session-revocation.service';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';
import { PasswordHasherService } from '$/core/crypto/password-hasher.service';
import type { PaginatedResult } from '$/core/http/pagination.dto';
import { pageParams, paginated } from '$/core/http/pagination.dto';

import type { EntityManager, FindOptionsWhere } from 'typeorm';

export interface UserView {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  language: string;
  timezone: string | null;
  isActive: boolean;
  isSpReset: boolean;
  /** Whether an Azure identity is linked. The `oid` itself is never exposed. */
  isSsoLinked: boolean;
  roleId: string | null;
  roleName: string | null;
  projectIds: string[];
  adminPanelIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Single-user view. `hasPassword` is deliberately absent from the LIST view —
 * answering it costs an extra column per row, and a list has no use for it.
 */
export interface UserDetailView extends UserView {
  hasPassword: boolean;
}

/**
 * Identity administration, on the CONSOLE connection.
 *
 * This is the only module in the service with write access to identity tables —
 * the authority connection holds SELECT plus a handful of self-service columns
 * and nothing more (dossier 0.20/0.23). The separation is enforced by the DB
 * grant, not by this class; the class merely runs where the grant allows it.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource(DataSourceName.Console)
    private readonly console: DataSource,
    private readonly audit: AuditService,
    private readonly sessions: SessionRevocationService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  async list(query: UserQueryDto): Promise<PaginatedResult<UserView>> {
    const { skip, take } = pageParams(query);

    const builder = this.console
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.projects', 'project')
      .leftJoinAndSelect('user.adminPanels', 'adminPanel')
      .orderBy('user.created_at', query.order ?? 'DESC')
      .skip(skip)
      .take(take);

    if (query.search) {
      builder.andWhere(
        '(user.username LIKE :search OR user.email LIKE :search OR user.first_name LIKE :search OR user.last_name LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.roleId) builder.andWhere('user.role_id = :roleId', { roleId: query.roleId });
    if (query.isActive !== undefined) {
      builder.andWhere('user.is_active = :isActive', { isActive: query.isActive });
    }

    const [rows, total] = await builder.getManyAndCount();

    return paginated(rows.map(toView), total, query);
  }

  async findOne(id: string): Promise<UserDetailView> {
    return this.detail(this.console.manager, id);
  }

  /**
   * Direct creation — password mode only (dossier 0.18).
   *
   * An SSO identity cannot be created here: `oid` is set exclusively by
   * invitation approval, where it comes from a verified Azure token. Allowing
   * an admin to type one in would let them attach an account to any Azure
   * identity in the tenant without that person ever signing in.
   */
  async create(dto: CreateUserDto, actorUserId: string | null): Promise<UserDetailView> {
    return this.console.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);

      if (await users.findOne({ where: { email: dto.email.toLowerCase() } })) {
        throw new ConflictException('A user with this email already exists.');
      }
      if (await users.findOne({ where: { username: dto.username } })) {
        throw new ConflictException('A user with this username already exists.');
      }

      const user = manager.create(UserEntity, {
        email: dto.email.toLowerCase(),
        username: dto.username,
        oid: null,
        password: dto.temporaryPassword
          ? await this.passwordHasher.hash(dto.temporaryPassword)
          : null,
        // A supplied password is TEMPORARY by definition — it was transmitted
        // to the admin and typed by them, so it must not survive first login.
        isSpReset: Boolean(dto.temporaryPassword),
        spUpdatedAt: dto.temporaryPassword ? new Date() : null,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        phone: dto.phone ?? null,
        language: dto.language ?? 'en',
        timezone: dto.timezone ?? null,
        isActive: dto.isActive ?? false,
        roleId: dto.roleId ?? null,
        projects: await this.resolve(manager, ProjectEntity, dto.projectIds, 'project'),
        adminPanels: await this.resolve(
          manager,
          AdminPanelEntity,
          dto.adminPanelIds,
          'admin panel',
        ),
      });

      const saved = await manager.save(user);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.UserCreated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: saved.id,
        metadata: {
          source: 'direct_creation',
          email: saved.email,
          username: saved.username,
          withTemporaryPassword: Boolean(dto.temporaryPassword),
          isActive: saved.isActive,
          roleId: saved.roleId,
        },
      });

      return this.detail(manager, saved.id);
    });
  }

  /** Profile fields only — no credentials, no grants, so no session impact (0.46). */
  async update(
    id: string,
    dto: UpdateUserDto,
    actorUserId: string | null,
  ): Promise<UserDetailView> {
    return this.console.transaction(async (manager) => {
      const user = await this.loadOrFail(manager, id);

      Object.assign(user, {
        firstName: dto.firstName ?? user.firstName,
        lastName: dto.lastName ?? user.lastName,
        phone: dto.phone ?? user.phone,
        language: dto.language ?? user.language,
        timezone: dto.timezone ?? user.timezone,
      });

      await manager.save(user);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.UserUpdated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: id,
        metadata: { fields: Object.keys(dto) },
      });

      return this.detail(manager, id);
    });
  }

  /**
   * Role and membership. Security-relevant by definition, so every live session
   * is revoked (0.46) — otherwise a demoted admin keeps their old permissions
   * until their refresh token expires, which can be days.
   */
  async updateAccess(
    id: string,
    dto: UpdateUserAccessDto,
    actorUserId: string | null,
  ): Promise<UserDetailView> {
    this.assertNotSelf(id, actorUserId, 'change your own role or project access');

    return this.console.transaction(async (manager) => {
      const user = await this.loadOrFail(manager, id);
      const previousRoleId = user.roleId;

      if (dto.roleId !== undefined) {
        // Both sides must be set together. Assigning `role = null` while
        // setting `roleId` lets TypeORM's relation updater win and writes
        // role_id = NULL — silently stripping the user of every permission.
        user.role = dto.roleId === null ? null : await this.loadRole(manager, dto.roleId);
        user.roleId = dto.roleId;
      }
      if (dto.projectIds !== undefined) {
        user.projects = await this.resolve(manager, ProjectEntity, dto.projectIds, 'project');
      }
      if (dto.adminPanelIds !== undefined) {
        user.adminPanels = await this.resolve(
          manager,
          AdminPanelEntity,
          dto.adminPanelIds,
          'admin panel',
        );
      }

      await manager.save(user);

      const revoked = await this.sessions.revokeAllForUser(id, 'access_changed', manager);

      await this.audit.recordWith(manager, {
        eventType:
          dto.roleId !== undefined && dto.roleId !== previousRoleId
            ? AuthEventType.UserRoleChanged
            : AuthEventType.UserGrantsChanged,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: id,
        metadata: {
          previousRoleId,
          roleId: user.roleId,
          projectIds: dto.projectIds,
          adminPanelIds: dto.adminPanelIds,
          sessionsRevoked: revoked,
        },
      });

      return this.detail(manager, id);
    });
  }

  /** Deactivation revokes sessions; activation does not need to (0.46). */
  async setActive(
    id: string,
    dto: SetActiveDto,
    actorUserId: string | null,
  ): Promise<UserDetailView> {
    if (!dto.isActive) this.assertNotSelf(id, actorUserId, 'deactivate your own account');

    return this.console.transaction(async (manager) => {
      const user = await this.loadOrFail(manager, id);
      user.isActive = dto.isActive;
      await manager.save(user);

      const revoked = dto.isActive
        ? 0
        : await this.sessions.revokeAllForUser(id, 'deactivated', manager);

      await this.audit.recordWith(manager, {
        eventType: dto.isActive ? AuthEventType.UserActivated : AuthEventType.UserDeactivated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: id,
        metadata: { sessionsRevoked: revoked },
      });

      return this.detail(manager, id);
    });
  }

  /**
   * The temporary-password flow (dossier 0.22).
   *
   * There is deliberately no self-service reset anywhere in this platform: a
   * user who forgets their password asks an administrator, who sets a temporary
   * one here and communicates it out of band. That removes email as a
   * credential-recovery channel entirely — no reset tokens, no reset links, no
   * mailbox-compromise path into the platform.
   *
   * The new password is returned to nobody: the caller already knows it, having
   * just sent it. `is_sp_reset` forces replacement at next login.
   */
  async setTemporaryPassword(
    id: string,
    dto: SetTemporaryPasswordDto,
    actorUserId: string | null,
  ): Promise<void> {
    await this.console.transaction(async (manager) => {
      const user = await this.loadOrFail(manager, id);

      user.password = await this.passwordHasher.hash(dto.password);
      user.isSpReset = true;
      user.spUpdatedAt = new Date();
      await manager.save(user);

      // A credential change: everything issued under the old one dies (0.46).
      const revoked = await this.sessions.revokeAllForUser(id, 'password_reset', manager);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.TempPasswordIssued,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: id,
        // The password itself is never recorded, here or anywhere.
        metadata: { sessionsRevoked: revoked },
      });
    });
  }

  /**
   * "Unauthorize" — the kill switch from Part I.
   *
   * Deactivate and revoke every refresh family in one transaction. The user's
   * current access token still lives out its TTL, which is the documented
   * revocation ceiling; what this guarantees is that the ceiling is one ACCESS
   * token lifetime (minutes) rather than one REFRESH lifetime (days).
   */
  async unauthorize(
    id: string,
    dto: UnauthorizeUserDto,
    actorUserId: string | null,
  ): Promise<{ sessionsRevoked: number }> {
    this.assertNotSelf(id, actorUserId, 'unauthorize your own account');

    return this.console.transaction(async (manager) => {
      const user = await this.loadOrFail(manager, id);

      user.isActive = false;
      await manager.save(user);

      const revoked = await this.sessions.revokeAllForUser(id, 'unauthorized', manager);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.UserUnauthorized,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: id,
        metadata: { reason: dto.reason ?? null, sessionsRevoked: revoked },
      });

      return { sessionsRevoked: revoked };
    });
  }

  /**
   * SOFT delete (0.47). The row survives so `auth_audit_events.actor_user_id`
   * keeps resolving; the generated `deleted_marker` releases the email,
   * username and `oid` for re-invitation.
   */
  async remove(id: string, actorUserId: string | null): Promise<void> {
    this.assertNotSelf(id, actorUserId, 'delete your own account');

    await this.console.transaction(async (manager) => {
      const user = await this.loadOrFail(manager, id);

      // Deactivate as well as soft-delete: `deleted_at` is invisible to any
      // query that forgets to filter it, whereas every auth path already
      // checks `is_active`. Belt and braces on the login path.
      user.isActive = false;
      await manager.save(user);

      const revoked = await this.sessions.revokeAllForUser(id, 'deleted', manager);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.UserDeleted,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: id,
        metadata: { email: user.email, username: user.username, sessionsRevoked: revoked },
      });

      await manager.softDelete(UserEntity, id);
    });
  }

  /**
   * 0.48 — an administrator may not remove their own access.
   *
   * Both failure modes this prevents (locking the last admin out, demoting
   * yourself by accident) are recoverable only by direct database access, which
   * is precisely what the three-principal split exists to make unnecessary.
   */
  private assertNotSelf(targetId: string, actorUserId: string | null, action: string): void {
    if (actorUserId && actorUserId === targetId) {
      throw new ForbiddenException(`You cannot ${action}. Ask another administrator.`);
    }
  }

  private async loadRole(manager: EntityManager, roleId: string): Promise<UserRoleEntity> {
    const role = await manager.findOne(UserRoleEntity, { where: { id: roleId } });
    if (!role) throw new BadRequestException('The specified role does not exist.');
    return role;
  }

  /**
   * Whether a password is set, WITHOUT loading the hash.
   *
   * `password` is `select: false` precisely so a hash is never pulled into
   * memory by an ordinary read. Selecting the boolean expression instead keeps
   * that true — the alternative, `addSelect('user.password')`, would load a
   * page of argon2id hashes to answer a yes/no question.
   */
  private async hasPassword(manager: EntityManager, id: string): Promise<boolean> {
    // A COUNT, not `SELECT password IS NOT NULL`. The raw form was wrong:
    // the driver returns that expression as the STRING '0' for a NULL
    // password, and `Boolean('0')` is `true` — so every SSO-only account
    // reported as having a password. Same trap as `Boolean('false')`.
    // `count()` returns a real number, and the hash is still never selected.
    const count = await manager.count(UserEntity, { where: { id, password: Not(IsNull()) } });

    return count > 0;
  }

  private async detail(manager: EntityManager, id: string): Promise<UserDetailView> {
    const user = await this.loadOrFail(manager, id);
    return { ...toView(user), hasPassword: await this.hasPassword(manager, id) };
  }

  private async loadOrFail(manager: EntityManager, id: string): Promise<UserEntity> {
    const user = await manager.findOne(UserEntity, {
      where: { id },
      relations: { role: true, projects: true, adminPanels: true },
    });

    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  /**
   * Resolves ids, refusing any that do not exist. Silently dropping an unknown
   * id would grant fewer projects than the administrator believed they granted,
   * with nothing in the response to say so.
   */
  private async resolve<T extends { id: string }>(
    manager: EntityManager,
    entity: new () => T,
    ids: string[] | undefined,
    label: string,
  ): Promise<T[]> {
    if (!ids || ids.length === 0) return [];

    // The cast is unavoidable: `FindOptionsWhere<T>` cannot be narrowed from a
    // `T extends { id: string }` bound. The constraint still guarantees `id`
    // exists on every entity this is called with.
    const where = { id: In(ids) } as FindOptionsWhere<T>;

    const found = await manager.find(entity, { where });
    if (found.length !== ids.length) {
      throw new BadRequestException(`One or more ${label} ids do not exist.`);
    }

    return found;
  }
}

function toView(user: UserEntity): UserView {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    language: user.language,
    timezone: user.timezone,
    isActive: user.isActive,
    isSpReset: user.isSpReset,
    // A boolean, never the value — the `oid` is an Azure directory identifier
    // and there is no reason for it to leave this service.
    isSsoLinked: Boolean(user.oid),
    roleId: user.roleId,
    roleName: user.role?.name ?? null,
    projectIds: user.projects.map((project) => project.id),
    adminPanelIds: user.adminPanels.map((panel) => panel.id),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
