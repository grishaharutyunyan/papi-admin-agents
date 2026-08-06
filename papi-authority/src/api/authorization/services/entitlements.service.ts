import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { AuditService } from '$/api/audit/services/audit.service';
import type {
  CatalogRefDto,
  SetProjectEntitlementsDto,
  SetUserOverridesDto,
} from '$/api/authorization/dto/authorization.dto';
import { PermissionCatalogEntity } from '$/api/authorization/entities/permission-catalog.entity';
import { ProjectEntitlementEntity } from '$/api/authorization/entities/project-entitlement.entity';
import { UserProjectPermissionEntity } from '$/api/authorization/entities/user-project-permission.entity';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { SessionRevocationService } from '$/api/users/services/session-revocation.service';
import { DataSourceName } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType, OverrideEffect } from '$/constants/enums/domain.enums';

import type { EntityManager } from 'typeorm';

/**
 * L2 (project entitlements) and L4 (per-user overrides), on the CONSOLE
 * connection.
 *
 * These are the two layers that make effective permissions differ from "what
 * the role says", so both writes revoke the sessions of everyone affected
 * (0.46). Skipping that would leave a removed entitlement live in issued tokens
 * until they expire — and an entitlement is a licence boundary, not a
 * preference.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectDataSource(DataSourceName.Console)
    private readonly console: DataSource,
    private readonly audit: AuditService,
    private readonly sessions: SessionRevocationService,
  ) {}

  async listForProject(projectId: string): Promise<CatalogRefDto[]> {
    await this.assertProject(this.console.manager, projectId);

    const rows = await this.console.manager.find(ProjectEntitlementEntity, {
      where: { projectId },
    });

    return rows.map(toRef);
  }

  /**
   * Replaces the project's L2 ceiling.
   *
   * Every member of the project has their sessions revoked, because lowering
   * the ceiling can remove a permission from anyone on it regardless of role.
   */
  async setForProject(
    projectId: string,
    dto: SetProjectEntitlementsDto,
    actorUserId: string | null,
  ): Promise<CatalogRefDto[]> {
    return this.console.transaction(async (manager) => {
      await this.assertProject(manager, projectId);

      const unique = dedupe(dto.entitlements);
      await this.assertInCatalog(manager, unique);

      const previous = await manager.count(ProjectEntitlementEntity, { where: { projectId } });

      await manager.delete(ProjectEntitlementEntity, { projectId });
      if (unique.length > 0) {
        await manager.insert(
          ProjectEntitlementEntity,
          unique.map((entitlement) => ({ projectId, ...entitlement })),
        );
      }

      const affected = await this.revokeProjectMembers(manager, projectId, 'entitlements_changed');

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.EntitlementsChanged,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'project',
        targetId: projectId,
        metadata: { previousCount: previous, newCount: unique.length, usersAffected: affected },
      });

      return unique;
    });
  }

  async listForUser(userId: string, projectId: string): Promise<OverrideView[]> {
    const rows = await this.console.manager.find(UserProjectPermissionEntity, {
      where: { userId, projectId },
    });

    return rows.map((row) => ({ ...toRef(row), effect: row.effect }));
  }

  /**
   * Replaces a user's L4 overrides for one project.
   *
   * A `grant` here is bounded by the project's L2 entitlements (dossier 0.39),
   * and that bound is enforced at RESOLUTION, not here — storing a grant the
   * project is not entitled to is harmless because the resolver intersects with
   * L2 anyway. It is still rejected at write time, so an administrator finds
   * out immediately rather than wondering why the grant has no effect.
   */
  async setForUser(
    userId: string,
    projectId: string,
    dto: SetUserOverridesDto,
    actorUserId: string | null,
  ): Promise<OverrideView[]> {
    return this.console.transaction(async (manager) => {
      await this.assertProject(manager, projectId);

      const user = await manager.findOne(UserEntity, { where: { id: userId } });
      if (!user) throw new NotFoundException('User not found.');

      const unique = dedupeOverrides(dto.overrides);
      await this.assertInCatalog(manager, unique);
      await this.assertGrantsWithinCeiling(manager, projectId, unique);

      await manager.delete(UserProjectPermissionEntity, { userId, projectId });
      if (unique.length > 0) {
        await manager.insert(
          UserProjectPermissionEntity,
          unique.map((override) => ({ userId, projectId, ...override })),
        );
      }

      await this.sessions.revokeAllForUser(userId, 'overrides_changed', manager);

      await this.audit.recordWith(manager, {
        eventType: AuthEventType.OverridesChanged,
        outcome: AuthEventOutcome.Success,
        actorUserId,
        targetType: 'user',
        targetId: userId,
        metadata: {
          projectId,
          count: unique.length,
          denies: unique.filter((override) => override.effect === OverrideEffect.Deny).length,
          grants: unique.filter((override) => override.effect === OverrideEffect.Grant).length,
        },
      });

      return unique;
    });
  }

  /* ---------------------------------------------------------- helpers ---- */

  private async assertProject(manager: EntityManager, projectId: string): Promise<void> {
    const project = await manager.findOne(ProjectEntity, { where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found.');
  }

  /**
   * The FK to `permission_catalog` would reject an unknown reference anyway;
   * this turns a driver-level constraint error into a message naming exactly
   * which permissions were wrong.
   */
  private async assertInCatalog(manager: EntityManager, refs: CatalogRefDto[]): Promise<void> {
    if (refs.length === 0) return;

    const known = await manager.find(PermissionCatalogEntity, {
      where: refs.map((ref) => ({
        section: ref.section,
        permissionKey: ref.permissionKey,
        kind: ref.kind,
      })),
    });

    if (known.length !== refs.length) {
      const knownKeys = new Set(known.map(keyOf));
      const unknown = refs.filter((ref) => !knownKeys.has(keyOf(ref)));
      throw new BadRequestException(
        `Unknown permission(s): ${unknown.map(keyOf).join(', ')}. The permission catalog is defined in code.`,
      );
    }
  }

  private async assertGrantsWithinCeiling(
    manager: EntityManager,
    projectId: string,
    overrides: { section: string; permissionKey: string; kind: string; effect: OverrideEffect }[],
  ): Promise<void> {
    const grants = overrides.filter((override) => override.effect === OverrideEffect.Grant);
    if (grants.length === 0) return;

    const entitlements = await manager.find(ProjectEntitlementEntity, { where: { projectId } });
    const licensed = new Set(entitlements.map(keyOf));

    const outside = grants.filter((grant) => !licensed.has(keyOf(grant)));
    if (outside.length > 0) {
      throw new BadRequestException(
        `Cannot grant permission(s) the project is not entitled to: ${outside.map(keyOf).join(', ')}. Add the entitlement first.`,
      );
    }
  }

  /** Revokes every member of the project; returns how many users were touched. */
  private async revokeProjectMembers(
    manager: EntityManager,
    projectId: string,
    reason: string,
  ): Promise<number> {
    const members = await manager
      .createQueryBuilder()
      .select('user_id', 'user_id')
      .from('user_projects', 'user_projects')
      .where('project_id = :projectId', { projectId })
      .getRawMany<{ user_id: string }>();

    for (const member of members) {
      await this.sessions.revokeAllForUser(member.user_id, reason, manager);
    }

    return members.length;
  }
}

export interface OverrideView extends CatalogRefDto {
  effect: OverrideEffect;
}

function toRef(row: CatalogRefDto): CatalogRefDto {
  return { section: row.section, permissionKey: row.permissionKey, kind: row.kind };
}

function keyOf(ref: { section: string; permissionKey: string; kind: string }): string {
  return `${ref.section}.${ref.permissionKey}:${ref.kind}`;
}

function dedupe(refs: CatalogRefDto[]): CatalogRefDto[] {
  const seen = new Map<string, CatalogRefDto>();
  for (const ref of refs) seen.set(keyOf(ref), ref);
  return [...seen.values()];
}

function dedupeOverrides<T extends CatalogRefDto & { effect: OverrideEffect }>(refs: T[]): T[] {
  const seen = new Map<string, T>();
  for (const ref of refs) seen.set(keyOf(ref), ref);
  return [...seen.values()];
}
