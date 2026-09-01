/**
 * The panel's pre-login auth-mode config, proxied from papi-authority's
 * `GET /api/app-init?panelKey=<PANEL_KEY>` (dossier 0.61). Same shape the old
 * `papi-back`/`rmp-back`/`cms-back`/`dmp-back` `configs/app-init` returned, so
 * the front-end's existing login-page-drawing logic needs no redesign.
 */
export interface AppInitResponse {
  basicAuthEnabled: boolean;
  ssoAuthEnabled: boolean;
  ssoTenantId: string | null;
  ssoClientId: string | null;
}

/** Narrows an unknown JSON body to `AppInitResponse` — never trust upstream shape blindly. */
export function isAppInitResponse(value: unknown): value is AppInitResponse {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  return (
    typeof v.basicAuthEnabled === 'boolean' &&
    typeof v.ssoAuthEnabled === 'boolean' &&
    (v.ssoTenantId === null || typeof v.ssoTenantId === 'string') &&
    (v.ssoClientId === null || typeof v.ssoClientId === 'string')
  );
}
