import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditController } from '$/api/audit/controllers/audit.controller';
import { AuthAuditEventEntity } from '$/api/audit/entities/auth-audit-event.entity';
import { AuditQueryService } from '$/api/audit/services/audit-query.service';
import { AuditService } from '$/api/audit/services/audit.service';
import { DataSourceName } from '$/constants/enums/config.enums';

/**
 * Bound to the authority connection, which holds INSERT and SELECT on
 * `auth_audit_events` but deliberately no UPDATE or DELETE — even the writer of
 * the trail cannot alter or erase it (dossier 0.25).
 *
 * The read API (0.55) runs on the same connection for the same reason: serving
 * the platform's most sensitive data needs `SELECT` and nothing else, and this
 * principal cannot write a single identity column.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuthAuditEventEntity], DataSourceName.Authority)],
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
