import { PermissionKind } from '$/constants/enums/domain.enums';

/**
 * THE single source of truth for every permission on the platform.
 *
 * `pages` gate a UI surface; `apis` gate an endpoint. They are separate so an
 * override can hide a page without blocking the endpoint behind it, or vice
 * versa (dossier F.5).
 *
 * Types are DERIVED from this object (see below), which is the whole point:
 * the forks hand-duplicate these lists as enums on each side and they have
 * already drifted — rmp-frontend is missing five actions the backend enforces
 * (F.4). Here a typo is a compile error, not a silently missing permission.
 *
 * Adding a permission:
 *   1. add it here
 *   2. `npm run permissions:generate-migration`
 *   3. `npm run migration:run`
 * `npm run permissions:check` fails the build if steps 2-3 are skipped.
 *
 * Section keys are normalized platform-wide. Note the forks disagree even on
 * these: papi-back writes `usersSection` where rmp writes `users` for the same
 * section (dossier D.3c), so no fork's stored blob is portable and this
 * catalog is authoritative over all of them.
 */
export const PERMISSION_CATALOG = {
  users: {
    pages: ['users'],
    apis: ['view', 'create', 'update', 'delete', 'invite', 'approve', 'unauthorize'],
  },
  userRoles: {
    pages: ['userRoles'],
    apis: ['view', 'create', 'update', 'delete'],
  },
  projects: {
    pages: ['projects'],
    apis: ['view', 'create', 'update', 'delete'],
  },
  projectOperators: {
    pages: ['projectOperators'],
    apis: ['view', 'create', 'update', 'delete'],
  },
  projectLimits: {
    pages: ['projectLimits'],
    apis: ['view', 'update'],
  },
  adminPanels: {
    pages: ['adminPanels'],
    apis: ['view', 'create', 'update', 'delete', 'configureAuth'],
  },
  entitlements: {
    pages: ['entitlements'],
    apis: ['view', 'update'],
  },
  audit: {
    pages: ['audit'],
    apis: ['view', 'export'],
  },
  platformSettings: {
    pages: ['platformSettings'],
    apis: ['view', 'update'],
  },
} as const;

export type PermissionCatalog = typeof PERMISSION_CATALOG;
export type PermissionSection = keyof PermissionCatalog;

/** `users.view`, `audit.export`, … — a literal union, not `string`. */
export type ApiPermissionRef = {
  [S in PermissionSection]: `${S}.${PermissionCatalog[S]['apis'][number]}`;
}[PermissionSection];

export type PagePermissionRef = {
  [S in PermissionSection]: `${S}.${PermissionCatalog[S]['pages'][number]}`;
}[PermissionSection];

export type PermissionRef = ApiPermissionRef | PagePermissionRef;

export interface CatalogEntry {
  section: string;
  permissionKey: string;
  kind: PermissionKind;
  description: string;
}

/** The catalog flattened into the rows `permission_catalog` should contain. */
export function flattenCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const [section, definition] of Object.entries(PERMISSION_CATALOG)) {
    for (const page of definition.pages) {
      entries.push({
        section,
        permissionKey: page,
        kind: PermissionKind.Page,
        description: `${section} page`,
      });
    }
    for (const api of definition.apis) {
      entries.push({
        section,
        permissionKey: api,
        kind: PermissionKind.Api,
        description: `${section}.${api} endpoint`,
      });
    }
  }

  return entries;
}

export function catalogRefOf(entry: { section: string; permissionKey: string }): string {
  return `${entry.section}.${entry.permissionKey}`;
}
