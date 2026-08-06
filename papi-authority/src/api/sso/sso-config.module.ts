import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { PlatformSettingsEntity } from '$/api/platform-settings/entities/platform-settings.entity';
import { AzureTokenVerifierService } from '$/api/sso/services/azure-token-verifier.service';
import { PanelSsoConfigService } from '$/api/sso/services/panel-sso-config.service';
import { DataSourceName } from '$/constants/enums/config.enums';

/**
 * Azure configuration resolution and token verification, split out from
 * `SsoModule` because invitation acceptance needs them too — and importing the
 * whole SSO module there would create a cycle (SSO needs invitations for
 * `open_sso` onboarding).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AdminPanelEntity, PlatformSettingsEntity], DataSourceName.Authority),
  ],
  providers: [PanelSsoConfigService, AzureTokenVerifierService],
  exports: [PanelSsoConfigService, AzureTokenVerifierService],
})
export class SsoConfigModule {}
