import type { ProjectPermissionSet } from '$/constants/interfaces/token-claims.interface';

/**
 * `GET /api/auth/session`'s response (tech plan Phase 5) — the front-end's
 * replacement for old papi-back's `/user/me` permissions field
 * (`req.user.role?.permissions || req.user.meta?.permissions`). A user can
 * hold different `.pages`/`.apis` sets on different projects (dossier
 * F.5/0.39: project entitlement gates the role, and a per-user override can
 * grant-within-ceiling or deny for one project specifically), so the
 * front-end needs one call to ask "what can I do on the project I have
 * selected" rather than re-deriving it by decoding its own JWT on every
 * render.
 */
export interface SessionResponse {
  projects: Record<string, ProjectPermissionSet>;
  platform: ProjectPermissionSet;
}
