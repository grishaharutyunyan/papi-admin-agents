import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '$/api/audit/audit.module';
import { PlatformSettingsController } from '$/api/platform-settings/controllers/platform-settings.controller';
import { PlatformSettingsEntity } from '$/api/platform-settings/entities/platform-settings.entity';
import { PlatformSettingsService } from '$/api/platform-settings/services/platform-settings.service';
import { DataSourceName } from '$/constants/enums/config.enums';

/** CONSOLE connection — `platform_settings` is an identity-group table (0.10). */
@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformSettingsEntity], DataSourceName.Console),
    AuditModule,
  ],
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
