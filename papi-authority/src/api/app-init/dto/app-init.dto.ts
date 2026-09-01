import { IsString, Matches, MaxLength } from 'class-validator';

import { PANEL_KEY } from '$/api/admin-panels/dto/admin-panel.dto';

/**
 * The only input this public, unauthenticated endpoint accepts. A fork sends
 * its own `PANEL_KEY` (dossier 0.61) so the login page knows which credential
 * types to draw before anyone has signed in.
 */
export class AppInitQueryDto {
  @IsString()
  @MaxLength(100)
  @Matches(PANEL_KEY, { message: 'panelKey may contain only A-Z, 0-9 and underscore' })
  panelKey!: string;
}

/**
 * The tenant/client ids are returned as real values here — unlike
 * `AdminPanelView` (the management-console shape), which reports only booleans
 * (`hasSsoTenantOverride`/`hasSsoClientOverride`). This endpoint exists
 * precisely so an unauthenticated login page can configure its Azure MSAL
 * client before a session exists; an Azure client id is not a secret.
 */
export interface AppInitView {
  basicAuthEnabled: boolean;
  ssoAuthEnabled: boolean;
  ssoTenantId: string | null;
  ssoClientId: string | null;
}
