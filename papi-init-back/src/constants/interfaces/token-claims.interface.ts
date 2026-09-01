/**
 * Effective permissions for one project, split by surface — copied verbatim
 * from papi-authority's own `token-claims.interface.ts` (the field names ARE
 * the wire contract; do not rename them).
 */
export interface ProjectPermissionSet {
  pages: string[];
  apis: string[];
}

/**
 * The access-token payload this service verifies (Phase 2, `src/core/jwks/`).
 * Same shape as papi-authority's `AccessTokenClaims` — copied field-for-field,
 * not reinvented, since this is the wire contract between the two services.
 *
 * The `projects` map carries every project the caller belongs to, which is
 * what makes switching project a client-side `x-project-id` change with no
 * new token and no call back to papi-authority. Phase 4's `PermissionGuard`
 * rejects an `x-project-id` that is not a key of this map.
 */
export interface AccessTokenClaims extends Record<string, unknown> {
  sub: string;
  iss: string;
  aud: string;
  /** Admin panel this token was issued for. */
  panel: string;
  projects: Record<string, ProjectPermissionSet>;
  /** Platform-scoped permissions, from role grants alone. */
  platform: ProjectPermissionSet;
  /** Reserved for future near-instant revocation; not enforced in v1. */
  epoch: number;
  jti: string;
  iat: number;
  exp: number;
}

function isProjectPermissionSet(value: unknown): value is ProjectPermissionSet {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  return isStringArray(v.pages) && isStringArray(v.apis);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isProjectPermissionSetMap(value: unknown): value is Record<string, ProjectPermissionSet> {
  if (value === null || typeof value !== 'object') return false;

  return Object.values(value as Record<string, unknown>).every(isProjectPermissionSet);
}

/**
 * Narrows a verified JWT payload to `AccessTokenClaims` — the signature being
 * valid says nothing about the payload actually carrying the claims this
 * service depends on; check the shape before trusting any field off it.
 */
export function isAccessTokenClaims(value: unknown): value is AccessTokenClaims {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  return (
    typeof v.sub === 'string' &&
    typeof v.iss === 'string' &&
    typeof v.aud === 'string' &&
    typeof v.panel === 'string' &&
    isProjectPermissionSetMap(v.projects) &&
    isProjectPermissionSet(v.platform) &&
    typeof v.epoch === 'number' &&
    typeof v.jti === 'string' &&
    typeof v.iat === 'number' &&
    typeof v.exp === 'number'
  );
}
