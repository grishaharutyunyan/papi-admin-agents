/**
 * papi-authority's actual `MeView` (its `src/api/users/services/me.service.ts`)
 * — profile fields only. Deliberately no `projects`, no `permissions`:
 * permissions are already baked into the access token (`GET /api/auth/session`
 * decodes them locally), and projects have their own endpoint
 * (`GET /api/users/me/projects`, `MeProjectView`).
 */
export interface MeView {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  language: string;
  timezone: string | null;
  mustChangePassword: boolean;
  roleId: string | null;
  roleName: string | null;
}

/** Narrows an unknown JSON body to `MeView` — never trust upstream shape blindly. */
export function isMeView(value: unknown): value is MeView {
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
    typeof v.mustChangePassword === 'boolean' &&
    (v.roleId === null || typeof v.roleId === 'string') &&
    (v.roleName === null || typeof v.roleName === 'string')
  );
}
