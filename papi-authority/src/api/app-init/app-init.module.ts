import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AppInitController } from '$/api/app-init/controllers/app-init.controller';
import { AppInitService } from '$/api/app-init/services/app-init.service';
import { PlatformSettingsEntity } from '$/api/platform-settings/entities/platform-settings.entity';
import { DataSourceName } from '$/constants/enums/config.enums';

/** AUTHORITY connection — read-only lookup, mirrors `SsoConfigModule`. */
@Module({
  imports: [
    TypeOrmModule.forFeature([AdminPanelEntity, PlatformSettingsEntity], DataSourceName.Authority),
  ],
  controllers: [AppInitController],
  providers: [AppInitService],
})
export class AppInitModule {}
