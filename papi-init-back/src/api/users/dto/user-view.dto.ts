/**
 * papi-authority's actual `UserView` (its `src/api/users/services/users.service.ts`)
 * — the list-view projection returned by `GET /api/users`. Deliberately no
 * `hasPassword`: that field only exists on the single-user DETAIL view,
 * which this service does not proxy (list-only scope, see papi-init-back
 * CLAUDE.md's "no local identity" section, case 1).
 */
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
  isSsoLinked: boolean;
  roleId: string | null;
  roleName: string | null;
  projectIds: string[];
  adminPanelIds: string[];
  createdAt: string;
  updatedAt: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Narrows an unknown JSON body to `UserView` — never trust upstream shape blindly. */
export function isUserView(value: unknown): value is UserView {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  return (
    typeof v.id === 'string' &&
    typeof v.email === 'string' &&
    typeof v.username === 'string' &&
    (v.firstName === null || typeof v.firstName === 'string') &&
    (v.lastName === null || typeof v.lastName === 'string') &&
    (v.phone === null || typeof v.phone === 'string') &&
    typeof v.language === 'string' &&
    (v.timezone === null || typeof v.timezone === 'string') &&
    typeof v.isActive === 'boolean' &&
    typeof v.isSpReset === 'boolean' &&
    typeof v.isSsoLinked === 'boolean' &&
    (v.roleId === null || typeof v.roleId === 'string') &&
    (v.roleName === null || typeof v.roleName === 'string') &&
    isStringArray(v.projectIds) &&
    isStringArray(v.adminPanelIds) &&
    typeof v.createdAt === 'string' &&
    typeof v.updatedAt === 'string'
  );
}

/** papi-authority's `PaginatedResult<UserView>` shape, as it arrives over JSON. */
export interface PaginatedUserView {
  items: UserView[];
  total: number;
  page: number;
  limit: number;
}

/** Narrows an unknown JSON body to `PaginatedUserView` — never trust upstream shape blindly. */
export function isPaginatedUserView(value: unknown): value is PaginatedUserView {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  return (
    Array.isArray(v.items) &&
    v.items.every(isUserView) &&
    typeof v.total === 'number' &&
    typeof v.page === 'number' &&
    typeof v.limit === 'number'
  );
}
