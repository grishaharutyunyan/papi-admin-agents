import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import type { AppInitView } from '$/api/app-init/dto/app-init.dto';
import { PlatformSettingsEntity } from '$/api/platform-settings/entities/platform-settings.entity';
import {
  findActivePanelByKey,
  resolveEffectiveSsoIds,
} from '$/api/sso/services/panel-sso-config.service';
import { DataSourceName } from '$/constants/enums/config.enums';

/**
 * Resolves the pre-login, panel-scoped auth-mode config (dossier 0.61).
 *
 * Read-only, on the AUTHORITY connection — the same connection
 * `PanelSsoConfigService`/`AzureTokenVerifierService` already use to read panel
 * auth settings during login, since this is exactly the same class of
 * "read config to decide how to authenticate" query, just reachable before any
 * credential exists.
 *
 * The tenant/client fallback computation itself is `resolveEffectiveSsoIds`
 * (shared with `PanelSsoConfigService`) — NOT that service's `.resolve()`,
 * which throws when SSO is disabled. Here, a disabled panel is a normal,
 * expected answer ("ssoAuthEnabled: false"), not an error; code review
 * (2026-08-30) caught this file duplicating the fallback `??` chain inline
 * instead of sharing it, which risked the two call sites silently diverging
 * if the rule ever changed. The active-panel lookup itself is shared the
 * same way, as `findActivePanelByKey` (code review, 2026-08-31 — this file
 * had also copy-pasted `panels.findOne({where:{panelKey,isActive:true}})`
 * from `PanelSsoConfigService.resolve()`).
 *
 * **Enabled-but-misconfigured degrades to "disabled" in the response, never
 * to null ids** (code review, 2026-08-30). If `ssoAuthEnabled` is true but
 * neither the panel nor `platform_settings` actually has a tenant/client id
 * set, reporting `ssoAuthEnabled: true` with `ssoTenantId/ssoClientId: null`
 * would tell an unauthenticated login page to render an SSO button that
 * crashes at MSAL-client construction — a page-load failure for a caller who
 * has no way to know why. `PanelSsoConfigService.resolve()` (the actual login
 * path) already treats this exact state as a misconfiguration and refuses
 * with `ForbiddenException`; this endpoint cannot do the same without also
 * blocking a panel's otherwise-working password login, so instead it just
 * never advertises the broken capability, and logs once so an operator can
 * find it without a user reporting a client-side crash.
 */
@Injectable()
export class AppInitService {
  private readonly logger = new Logger(AppInitService.name);

  constructor(
    @InjectRepository(AdminPanelEntity, DataSourceName.Authority)
    private readonly panels: Repository<AdminPanelEntity>,
    @InjectRepository(PlatformSettingsEntity, DataSourceName.Authority)
    private readonly settings: Repository<PlatformSettingsEntity>,
  ) {}

  async resolve(panelKey: string): Promise<AppInitView> {
    const panel = await findActivePanelByKey(this.panels, panelKey);

    // A caller learns nothing beyond "this panel key isn't live" — the same
    // information it would get from a failed login against it.
    if (!panel) {
      throw new NotFoundException('Admin panel not found.');
    }

    let ssoAuthEnabled = false;
    let ssoTenantId: string | null = null;
    let ssoClientId: string | null = null;

    if (panel.ssoAuthEnabled) {
      const platform = await this.settings.findOne({ where: { id: 1 } });
      const resolved = resolveEffectiveSsoIds(panel, platform);

      if (resolved.tenantId && resolved.clientId) {
        ssoAuthEnabled = true;
        ssoTenantId = resolved.tenantId;
        ssoClientId = resolved.clientId;
      } else {
        this.logger.warn(
          `Panel "${panelKey}" has ssoAuthEnabled=true but no effective tenant/client id ` +
            '(no panel override and no platform_settings default) — reporting SSO as disabled ' +
            'to app-init callers rather than advertising a login method that would fail.',
        );
      }
    }

    return {
      basicAuthEnabled: panel.basicAuthEnabled,
      ssoAuthEnabled,
      ssoTenantId,
      ssoClientId,
    };
  }
}
