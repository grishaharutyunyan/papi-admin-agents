/** Effective permissions for one project, split by surface (dossier F.5). */
export interface ProjectPermissionSet {
  pages: string[];
  apis: string[];
}

/**
 * The access-token payload (dossier Part I).
 *
 * The `projects` map carries EVERY project the user belongs to, which is what
 * makes switching project a client-side `x-project-id` change with no new token
 * and no call to papi-authority (B.7). The fork rejects an `x-project-id` that
 * is not a key of this map, so cross-project replay is impossible.
 */
export interface AccessTokenClaims extends Record<string, unknown> {
  sub: string;
  iss: string;
  aud: string;
  /** Admin panel this token was issued for. */
  panel: string;
  projects: Record<string, ProjectPermissionSet>;
  /**
   * Platform-scoped permissions, from role grants alone (dossier 0.43).
   *
   * These govern papi-authority's OWN admin surface — invitations, users,
   * roles, admin panels, platform settings — none of which belong to a tenant.
   * Project-scoped work continues to read `projects[x-project-id]`.
   */
  platform: ProjectPermissionSet;
  /** Reserved for future near-instant revocation; not enforced in v1 (Part N). */
  epoch: number;
  jti: string;
  iat: number;
  exp: number;
}
