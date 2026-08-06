import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { ProjectEntitlementEntity } from '$/api/authorization/entities/project-entitlement.entity';
import { RolePermissionEntity } from '$/api/authorization/entities/role-permission.entity';
import { UserProjectPermissionEntity } from '$/api/authorization/entities/user-project-permission.entity';
import { DataSourceName } from '$/constants/enums/config.enums';
import { OverrideEffect, PermissionKind } from '$/constants/enums/domain.enums';
import type { ProjectPermissionSet } from '$/constants/interfaces/token-claims.interface';

/** Identity needed to resolve, gathered by the caller from the user record. */
export interface ResolverSubject {
  userId: string;
  roleId: string | null;
  /** L1 — the projects this user is a member of. */
  projectIds: string[];
}

/** `section.key` plus kind, the unit everything is keyed by. */
function refOf(row: { section: string; permissionKey: string; kind: PermissionKind }): string {
  return `${row.kind}:${row.section}.${row.permissionKey}`;
}

/**
 * The 4-layer authorization model (dossier F.5), computed once per login and
 * per refresh and baked into the access token.
 *
 *     effective = ((L2 ∩ L3) ∪ (L2 ∩ L4grant)) − L4deny,  gated by L1
 *
 *   L1  user ↔ project membership  — no membership, no entry in the map at all
 *   L2  project entitlement        — what the PROJECT is licensed for
 *   L3  role permission            — what the ROLE allows
 *   L4  user↔project override      — deny subtracts, grant adds within L2 (0.39)
 *
 * Two properties worth stating because they are what the forks get wrong:
 *
 *  - **L2 gates before L3.** A permission a role grants but the project is not
 *    entitled to is absent from the token. rmp has no L2 at all, so a role
 *    grant applies everywhere.
 *  - **L4 composes with the role rather than replacing it.** In the forks a
 *    role REPLACES the user's own permissions entirely, making per-user data
 *    dead whenever a role is attached (D.3c). Here an override adjusts the role
 *    result for exactly one (user, project) pair.
 *
 * Runs on the authority connection — all four layers are read-only here.
 */
@Injectable()
export class PermissionResolverService {
  constructor(
    @InjectRepository(RolePermissionEntity, DataSourceName.Authority)
    private readonly rolePermissions: Repository<RolePermissionEntity>,
    @InjectRepository(ProjectEntitlementEntity, DataSourceName.Authority)
    private readonly entitlements: Repository<ProjectEntitlementEntity>,
    @InjectRepository(UserProjectPermissionEntity, DataSourceName.Authority)
    private readonly overrides: Repository<UserProjectPermissionEntity>,
  ) {}

  /**
   * Platform-scoped permissions (dossier 0.43) — role grants ALONE.
   *
   * L2 and L4 are deliberately not consulted: there is no tenant to license a
   * platform resource, and no project to scope an override to. Managing admin
   * panels or issuing invitations is role-based, full stop.
   *
   * Still default-deny: no role means an empty set, never everything.
   */
  async resolvePlatform(roleId: string | null): Promise<ProjectPermissionSet> {
    if (!roleId) return { pages: [], apis: [] };

    const roleRows = await this.rolePermissions.find({ where: { roleId } });
    return splitByKind(new Set(roleRows.map(refOf)));
  }

  async resolve(subject: ResolverSubject): Promise<Record<string, ProjectPermissionSet>> {
    // L1: no memberships means no projects in the token, whatever the role says.
    if (subject.projectIds.length === 0) return {};

    const [roleRows, entitlementRows, overrideRows] = await Promise.all([
      subject.roleId
        ? this.rolePermissions.find({ where: { roleId: subject.roleId } })
        : Promise.resolve([]),
      this.entitlements.find({ where: { projectId: In(subject.projectIds) } }),
      this.overrides.find({
        where: { userId: subject.userId, projectId: In(subject.projectIds) },
      }),
    ]);

    // L3 — role grants, project-independent.
    const rolePermissionRefs = new Set(roleRows.map(refOf));

    const entitlementsByProject = groupByProject(entitlementRows);
    const overridesByProject = groupByProject(overrideRows);

    const result: Record<string, ProjectPermissionSet> = {};

    for (const projectId of subject.projectIds) {
      // L2 — what this project is licensed for. Absent entitlements mean an
      // empty set, which correctly yields no permissions for ANYONE on it.
      const licensed = new Set((entitlementsByProject.get(projectId) ?? []).map(refOf));

      const denied = new Set<string>();
      const granted = new Set<string>();
      for (const override of overridesByProject.get(projectId) ?? []) {
        (override.effect === OverrideEffect.Deny ? denied : granted).add(refOf(override));
      }

      const effective = new Set<string>();

      for (const ref of licensed) {
        // (L2 ∩ L3), plus (L2 ∩ L4grant) — a grant can add only within licence.
        if (rolePermissionRefs.has(ref) || granted.has(ref)) effective.add(ref);
      }

      // Deny always wins, including over an explicit grant for the same key.
      for (const ref of denied) effective.delete(ref);

      result[projectId] = splitByKind(effective);
    }

    return result;
  }
}

function groupByProject<T extends { projectId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.projectId);
    if (bucket) bucket.push(row);
    else grouped.set(row.projectId, [row]);
  }
  return grouped;
}

function splitByKind(refs: Set<string>): ProjectPermissionSet {
  const pages: string[] = [];
  const apis: string[] = [];

  const pagePrefix = `${PermissionKind.Page}:`;

  for (const ref of refs) {
    if (ref.startsWith(pagePrefix)) pages.push(ref.slice(pagePrefix.length));
    else apis.push(ref.slice(ref.indexOf(':') + 1));
  }

  return { pages: pages.sort(), apis: apis.sort() };
}
