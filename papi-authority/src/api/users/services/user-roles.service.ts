import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { AuditService } from '$/api/audit/services/audit.service';
import { PermissionCatalogEntity } from '$/api/authorization/entities/permission-catalog.entity';
import { RolePermissionEntity } from '$/api/authorization/entities/role-permission.entity';
import type {
  CreateUserRoleDto,
  PermissionRefDto,
  SetRolePermissionsDto,
  UpdateUserRoleDto,
} from '$/api/users/dto/user-role.dto';
import { UserRoleEntity } from '$/api/users/entities/user-role.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { SessionRevocationService } from '$/api/users/services/session-revocation.service';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';
import type { PaginatedResult, PaginationQueryDto } from '$/core/http/pagination.dto';
import { pageParams, paginated } from '$/core/http/pagination.dto';

import type { EntityManager } from 'typeorm';

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  userCount: number;
  permissions: PermissionRefDto[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Roles and their L3 grants, on the CONSOLE connection.
 *
 * `role_permissions` rows are foreign-keyed into `permission_catalog`, so a
 * permission that the application does not define cannot be granted at all —
 * the database refuses it. That is the structural fix for the forks' JSON
 * permission blob, where a typo produced a permission nobody ever holds and
 * nothing ever reports (dossier 0.30 / F.4).
 */
@Injectable()
export class UserRolesService {
  constructor(
    @InjectDataSource(DataSourceName.Console)
    private readonly console: DataSource,
    private readonly audit: AuditService,
    private readonly sessions: SessionRevocationService,
  ) {}

  async list(query: PaginationQueryDto): Promise<PaginatedResult<RoleView>> {
    const { skip, take } = pageParams(query);

    const builder = this.console
      .getRepository(UserRoleEntity)
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .orderBy('role.name', query.order ?? 'ASC')
      .skip(skip)
      .take(take);

    if (query.search) {
      builder.andWhere('role.name LIKE :search', { search: `%${query.search}%` });
    }

    const [rows, total] = await builder.getManyAndCount();
    const counts = await this.userCounts(
      this.console.manager,
      rows.map((role) => role.id),
    );

    return paginated(
      rows.map((role) => toView(role, counts.get(role.id) ?? 0)),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<RoleView> {
    return this.view(this.console.manager, id);
  }

  async create(dto: CreateUserRoleDto, actorUserId: string | null): Promise<RoleView> {
    return this.console.transaction(async (manager) => {
      if (await manager.findOne(UserRoleEntity, { where: { name: dto.name } })) {
        throw new ConflictException('A role with this name already exists.');
      }

      const role = await manager.save(
        manager.create(UserRoleEntity, {
          name: dto.name,
          description: dto.description ?? null,
          isPublic: dto.isPublic ?? false,
        }),
      );

      if (dto.permissions?.length) {
        await this.replacePermissions(manager, role.id, dto.permissions);
      }

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.RoleCreated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'role',
        targetId: role.id,
        metadata: { name: role.name, permissionCount: dto.permissions?.length ?? 0 },
      });

      return this.view(manager, role.id);
    });
  }

  async update(id: string, dto: UpdateUserRoleDto, actorUserId: string | null): Promise<RoleView> {
    return this.console.transaction(async (manager) => {
      const role = await this.loadOrFail(manager, id);

      if (dto.name && dto.name !== role.name) {
        const clash = await manager.findOne(UserRoleEntity, { where: { name: dto.name } });
        if (clash) throw new ConflictException('A role with this name already exists.');
      }

      Object.assign(role, {
        name: dto.name ?? role.name,
        description: dto.description ?? role.description,
        isPublic: dto.isPublic ?? role.isPublic,
      });
      await manager.save(role);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.RoleUpdated,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'role',
        targetId: id,
        metadata: { fields: Object.keys(dto) },
      });

      return this.view(manager, id);
    });
  }

  /**
   * Replaces a role's grants and revokes the sessions of everyone holding it.
   *
   * Without the revocation a permission removed here stays live in every issued
   * token until it expires. Refresh alone is not enough — the holder keeps the
   * old access token — so the sessions are cut, which is exactly the
   * "security-relevant change" case of 0.46.
   */
  async setPermissions(
    id: string,
    dto: SetRolePermissionsDto,
    actorUserId: string | null,
  ): Promise<RoleView> {
    return this.console.transaction(async (manager) => {
      await this.loadOrFail(manager, id);

      const previous = await manager.count(RolePermissionEntity, { where: { roleId: id } });
      await this.replacePermissions(manager, id, dto.permissions);

      const affected = await manager.find(UserEntity, {
        where: { roleId: id },
        select: { id: true },
      });
      for (const user of affected) {
        await this.sessions.revokeAllForUser(user.id, 'role_permissions_changed', manager);
      }

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.RolePermissionsChanged,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'role',
        targetId: id,
        metadata: {
          previousCount: previous,
          newCount: dto.permissions.length,
          usersAffected: affected.length,
        },
      });

      return this.view(manager, id);
    });
  }

  /**
   * 0.48 — a role still held by somebody cannot be deleted.
   *
   * The FK is `RESTRICT`, so the database would refuse anyway; this turns that
   * into a clear 400 instead of a driver error, and says how many users are in
   * the way. Deleting out from under holders would leave them with a dangling
   * `role_id` and no permissions at all — a silent, platform-wide lockout.
   */
  async remove(id: string, actorUserId: string | null): Promise<void> {
    await this.console.transaction(async (manager) => {
      const role = await this.loadOrFail(manager, id);

      const holders = await manager.count(UserEntity, { where: { roleId: id } });
      if (holders > 0) {
        throw new BadRequestException(
          `This role is still assigned to ${holders} user(s). Reassign them before deleting it.`,
        );
      }

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.RoleDeleted,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'role',
        targetId: id,
        metadata: { name: role.name },
      });

      // Soft delete (0.47): audit events and historical `role_id` references
      // must keep resolving. `deleted_marker` frees the name for reuse.
      await manager.softDelete(UserRoleEntity, id);
    });
  }

  /**
   * Delete-then-insert, inside the caller's transaction.
   *
   * Every reference is validated against `permission_catalog` FIRST, so an
   * unknown permission aborts before anything is removed. Otherwise a typo in
   * one entry would strip the role of every grant it had and then fail.
   */
  private async replacePermissions(
    manager: EntityManager,
    roleId: string,
    permissions: PermissionRefDto[],
  ): Promise<void> {
    const unique = dedupe(permissions);

    if (unique.length > 0) {
      const known = await manager.find(PermissionCatalogEntity, {
        where: unique.map((permission) => ({
          section: permission.section,
          permissionKey: permission.permissionKey,
          kind: permission.kind,
        })),
      });

      if (known.length !== unique.length) {
        const knownKeys = new Set(known.map(keyOf));
        const unknown = unique.filter((permission) => !knownKeys.has(keyOf(permission)));
        throw new BadRequestException(
          `Unknown permission(s): ${unknown.map(keyOf).join(', ')}. The permission catalog is defined in code.`,
        );
      }
    }

    await manager.delete(RolePermissionEntity, { roleId });

    if (unique.length > 0) {
      await manager.insert(
        RolePermissionEntity,
        unique.map((permission) => ({ roleId, ...permission })),
      );
    }
  }

  private async view(manager: EntityManager, id: string): Promise<RoleView> {
    const role = await this.loadOrFail(manager, id);
    const counts = await this.userCounts(manager, [id]);

    return toView(role, counts.get(id) ?? 0);
  }

  private async loadOrFail(manager: EntityManager, id: string): Promise<UserRoleEntity> {
    const role = await manager.findOne(UserRoleEntity, {
      where: { id },
      relations: { permissions: true },
    });

    if (!role) throw new NotFoundException('Role not found.');
    return role;
  }

  /** One grouped query rather than N counts — a role list is a common screen. */
  private async userCounts(
    manager: EntityManager,
    roleIds: string[],
  ): Promise<Map<string, number>> {
    if (roleIds.length === 0) return new Map();

    const rows = await manager
      .createQueryBuilder(UserEntity, 'user')
      .select('user.role_id', 'role_id')
      .addSelect('COUNT(*)', 'count')
      .where('user.role_id IN (:...roleIds)', { roleIds })
      .groupBy('user.role_id')
      .getRawMany<{ role_id: string; count: string }>();

    return new Map(rows.map((row) => [row.role_id, Number(row.count)]));
  }
}

function toView(role: UserRoleEntity, userCount: number): RoleView {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isPublic: role.isPublic,
    userCount,
    permissions: (role.permissions ?? []).map((permission) => ({
      section: permission.section,
      permissionKey: permission.permissionKey,
      kind: permission.kind,
    })),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function keyOf(permission: { section: string; permissionKey: string; kind: string }): string {
  return `${permission.section}.${permission.permissionKey}:${permission.kind}`;
}

function dedupe(permissions: PermissionRefDto[]): PermissionRefDto[] {
  const seen = new Map<string, PermissionRefDto>();
  for (const permission of permissions) seen.set(keyOf(permission), permission);
  return [...seen.values()];
}
