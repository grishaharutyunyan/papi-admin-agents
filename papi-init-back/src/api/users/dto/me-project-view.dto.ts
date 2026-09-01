/**
 * papi-authority's `MeProjectView` (dossier 0.62) — the caller's own project
 * memberships, projected to display fields only. What the front-end's project
 * switcher renders. This is NOT permission data: which project is actually
 * usable still comes from checking `x-project-id` against the access token's
 * `projects` claim (Phase 4), never from a project appearing in this list.
 */
export interface MeProjectView {
  id: string;
  project: string;
  name: string;
  theme: string;
  logoUrl: string | null;
}

function isMeProjectView(value: unknown): value is MeProjectView {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  return (
    typeof v.id === 'string' &&
    typeof v.project === 'string' &&
    typeof v.name === 'string' &&
    typeof v.theme === 'string' &&
    (v.logoUrl === null || typeof v.logoUrl === 'string')
  );
}

/** Narrows an unknown JSON body to `MeProjectView[]` — never trust upstream shape blindly. */
export function isMeProjectViewArray(value: unknown): value is MeProjectView[] {
  return Array.isArray(value) && value.every(isMeProjectView);
}
