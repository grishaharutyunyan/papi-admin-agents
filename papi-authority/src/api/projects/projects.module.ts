import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '$/api/audit/audit.module';
import { ProjectsController } from '$/api/projects/controllers/projects.controller';
import { ProjectBlockerEntity } from '$/api/projects/entities/project-blocker.entity';
import { ProjectLimitEntity } from '$/api/projects/entities/project-limit.entity';
import { ProjectOperatorOpTypeEntity } from '$/api/projects/entities/project-operator-op-type.entity';
import { ProjectOperatorEntity } from '$/api/projects/entities/project-operator.entity';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { ProjectsService } from '$/api/projects/services/projects.service';
import { DataSourceName } from '$/constants/enums/config.enums';

/** CONSOLE connection only — projects are identity-group tables (dossier 0.10). */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        ProjectEntity,
        ProjectLimitEntity,
        ProjectOperatorEntity,
        ProjectOperatorOpTypeEntity,
        ProjectBlockerEntity,
      ],
      DataSourceName.Console,
    ),
    AuditModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
