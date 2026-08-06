import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminPanelsController } from '$/api/admin-panels/controllers/admin-panels.controller';
import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AdminPanelsService } from '$/api/admin-panels/services/admin-panels.service';
import { AuditModule } from '$/api/audit/audit.module';
import { DataSourceName } from '$/constants/enums/config.enums';

/** CONSOLE connection — `admin_panels` is an identity-group table (0.10). */
@Module({
  imports: [TypeOrmModule.forFeature([AdminPanelEntity], DataSourceName.Console), AuditModule],
  controllers: [AdminPanelsController],
  providers: [AdminPanelsService],
})
export class AdminPanelsModule {}
