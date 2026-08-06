import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';

import { AuditQueryDto } from '$/api/audit/dto/audit-query.dto';
import { AuditQueryService, EXPORT_MAX_ROWS } from '$/api/audit/services/audit-query.service';
import { PlatformPermissions } from '$/decorators/public.decorator';

/**
 * The audit trail, read-only (dossier 0.55).
 *
 * There is **no POST, PATCH, PUT or DELETE here, and there never will be**.
 * The trail is append-only at the database level — the console principal is
 * denied `UPDATE` and `DELETE`, and the authority principal this controller
 * runs as holds `SELECT` and `INSERT` only. Writing happens as a side effect of
 * the action being audited, never through an API.
 *
 * Retention is likewise absent by design (0.54): pruning runs as an operations
 * job under a separate maintenance principal, because the alternative is
 * granting a runtime principal blanket `DELETE` on the security history.
 */
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @PlatformPermissions(['audit', 'view'])
  search(@Query() query: AuditQueryDto) {
    return this.audit.search(query);
  }

  /**
   * How many rows a given filter matches. Exists so the console can warn
   * before an export silently hits the cap — a truncated audit export that
   * looks complete is worse than no export.
   */
  @Get('count')
  @PlatformPermissions(['audit', 'view'])
  async count(@Query() query: AuditQueryDto) {
    const total = await this.audit.count(query);

    return { total, exportLimit: EXPORT_MAX_ROWS, exceedsExportLimit: total > EXPORT_MAX_ROWS };
  }

  /** Separate permission from `view`: bulk extraction is its own capability. */
  @Get('export')
  @PlatformPermissions(['audit', 'export'])
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="audit-export.csv"')
  // Stops a browser from sniffing the CSV into something executable.
  @Header('x-content-type-options', 'nosniff')
  async export(@Query() query: AuditQueryDto): Promise<StreamableFile> {
    const csv = await this.audit.exportCsv(query);

    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
}
