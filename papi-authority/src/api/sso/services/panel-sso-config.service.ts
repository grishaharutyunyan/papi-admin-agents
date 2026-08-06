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
    const panel = await this.panels.findOne({ where: { panelKey, isActive: true } });
    if (!panel) throw new ForbiddenException('SSO is not available for this panel.');

    // A panel running password-only auth must reject SSO, mirroring the way a
    // password login is rejected on an Azure-only panel (dossier 0.5 / 0.22).
    if (!panel.ssoAuthEnabled) {
      throw new ForbiddenException('SSO is disabled for this panel.');
    }

    const platform = await this.settings.findOne({ where: { id: 1 } });

    const tenantId = panel.ssoTenantId ?? platform?.ssoTenantId ?? null;
    const clientId = panel.ssoClientId ?? platform?.ssoClientId ?? null;

    if (!tenantId || !clientId) {
      // Misconfiguration, not a credential failure — and deliberately not
      // reported as "invalid token", which would send an operator hunting the
      // wrong problem.
      throw new ForbiddenException('SSO is not configured for this panel.');
    }

    return { panel, tenantId, clientId };
  }
}
