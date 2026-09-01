import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { PlatformSettingsEntity } from '$/api/platform-settings/entities/platform-settings.entity';
import { DataSourceName } from '$/constants/enums/config.enums';

export interface EffectiveSsoConfig {
  panel: AdminPanelEntity;
  tenantId: string;
  clientId: string;
}

interface ResolvableSsoIds {
  ssoTenantId: string | null;
  ssoClientId: string | null;
}

/**
 * The panel-override-then-platform-default fallback rule (dossier 0.9), as a
 * pure function so it has exactly ONE implementation on the platform.
 *
 * `PanelSsoConfigService.resolve()` (below, the authenticated SSO-login path)
 * and `AppInitService` (`src/api/app-init/`, the public pre-login path) both
 * need this exact computation but must NOT share `.resolve()` itself — that
 * method throws when SSO is disabled, which is the correct behavior for an
 * actual login attempt and the wrong behavior for a config-probe endpoint
 * that must answer "SSO is off for this panel" without erroring. Splitting
 * the fallback math out is what lets both call sites stay correct without
 * copying the `??` chain — a maintainer changing this rule only ever changes
 * it here.
 */
export function resolveEffectiveSsoIds(
  panel: ResolvableSsoIds,
  platform: ResolvableSsoIds | null,
): { tenantId: string | null; clientId: string | null } {
  return {
    tenantId: panel.ssoTenantId ?? platform?.ssoTenantId ?? null,
    clientId: panel.ssoClientId ?? platform?.ssoClientId ?? null,
  };
}

/**
 * The "is this panel key usable at all" lookup — shared for the same reason
 * as {@link resolveEffectiveSsoIds} (code review, 2026-08-31 — was
 * copy-pasted into `AppInitService` instead of shared): both the real
 * SSO-login path and the public pre-login `app-init` probe need to agree on
 * which panels are active, and a future change to that rule (e.g. adding a
 * maintenance-mode flag) should only ever need to change here.
 */
export function findActivePanelByKey(
  panels: Repository<AdminPanelEntity>,
  panelKey: string,
): Promise<AdminPanelEntity | null> {
  return panels.findOne({ where: { panelKey, isActive: true } });
}

/**
 * Resolves which Azure app registration a panel authenticates against
 * (dossier 0.9).
 *
 * The platform normally shares ONE app registration, held in the single-row
 * `platform_settings`. The per-panel `sso_tenant_id`/`sso_client_id` columns are
 * nullable OVERRIDES — the escape hatch if one panel ever needs its own tenant.
 * Resolution is therefore: panel override → platform default.
 */
@Injectable()
export class PanelSsoConfigService {
  constructor(
    @InjectRepository(AdminPanelEntity, DataSourceName.Authority)
    private readonly panels: Repository<AdminPanelEntity>,
    @InjectRepository(PlatformSettingsEntity, DataSourceName.Authority)
    private readonly settings: Repository<PlatformSettingsEntity>,
  ) {}

  async resolve(panelKey: string): Promise<EffectiveSsoConfig> {
    const panel = await findActivePanelByKey(this.panels, panelKey);
    if (!panel) throw new ForbiddenException('SSO is not available for this panel.');

    // A panel running password-only auth must reject SSO, mirroring the way a
    // password login is rejected on an Azure-only panel (dossier 0.5 / 0.22).
    if (!panel.ssoAuthEnabled) {
      throw new ForbiddenException('SSO is disabled for this panel.');
    }

    const platform = await this.settings.findOne({ where: { id: 1 } });
    const { tenantId, clientId } = resolveEffectiveSsoIds(panel, platform);

    if (!tenantId || !clientId) {
      // Misconfiguration, not a credential failure — and deliberately not
      // reported as "invalid token", which would send an operator hunting the
      // wrong problem.
      throw new ForbiddenException('SSO is not configured for this panel.');
    }

    return { panel, tenantId, clientId };
  }
}
