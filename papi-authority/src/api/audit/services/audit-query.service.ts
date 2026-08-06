import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import type { AuditQueryDto } from '$/api/audit/dto/audit-query.dto';
import { AuthAuditEventEntity } from '$/api/audit/entities/auth-audit-event.entity';
import { DataSourceName } from '$/constants/enums/config.enums';
import type { PaginatedResult } from '$/core/http/pagination.dto';
import { pageParams, paginated } from '$/core/http/pagination.dto';

import type { SelectQueryBuilder } from 'typeorm';

/** Bounded so an export cannot become an unbounded table dump (0.54/0.55). */
const EXPORT_MAX_ROWS = 50_000;

/**
 * Reads the audit trail for the console (dossier 0.55).
 *
 * Runs on the **AUTHORITY** connection, not the console one. Reading the trail
 * needs `SELECT` and nothing more, and the authority principal cannot write a
 * single identity column — so the endpoint that exposes the most sensitive
 * data in the platform executes with the least privilege available.
 *
 * Rows are returned in full: `ip`, `userAgent`, `metadata` and geo are all
 * visible behind `audit.view`. Masking them would leave the console unable to
 * answer the questions the trail exists for, while adding no boundary the
 * permission does not already provide.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    @InjectRepository(AuthAuditEventEntity, DataSourceName.Authority)
    private readonly events: Repository<AuthAuditEventEntity>,
  ) {}

  async search(query: AuditQueryDto): Promise<PaginatedResult<AuthAuditEventEntity>> {
    const { skip, take } = pageParams(query);

    const builder = this.applyFilters(this.events.createQueryBuilder('event'), query)
      .orderBy(
        query.sortBy === 'eventType' ? 'event.event_type' : 'event.created_at',
        query.order ?? 'DESC',
      )
      // A tiebreaker on the primary key: `created_at` is not unique at
      // microsecond precision under load, and without this two pages can both
      // include — or both omit — the same row.
      .addOrderBy('event.id', query.order ?? 'DESC')
      .skip(skip)
      .take(take);

    const [items, total] = await builder.getManyAndCount();

    return paginated(items, total, query);
  }

  /**
   * CSV export. Requires an explicit time range, and is capped.
   *
   * The range is mandatory rather than defaulted because "export everything"
   * on an append-only trail is a request to serialise the entire security
   * history of the platform into one file — which is a data-exfiltration
   * primitive, not a feature. An auditor investigating an incident always
   * knows roughly when it happened.
   */
  async exportCsv(query: AuditQueryDto): Promise<string> {
    if (!query.from || !query.to) {
      throw new BadRequestException('An export requires both `from` and `to`.');
    }

    const rows = await this.applyFilters(this.events.createQueryBuilder('event'), query)
      .orderBy('event.created_at', 'ASC')
      .addOrderBy('event.id', 'ASC')
      .take(EXPORT_MAX_ROWS)
      .getMany();

    const header = [
      'id',
      'created_at',
      'event_type',
      'outcome',
      'actor_user_id',
      'target_type',
      'target_id',
      'admin_panel_id',
      'ip',
      'geo_country',
      'geo_city',
      'geo_asn',
      'user_agent',
      'jti',
      'request_id',
      'metadata',
    ];

    const lines = rows.map((row) =>
      [
        row.id,
        row.createdAt.toISOString(),
        row.eventType,
        row.outcome,
        row.actorUserId,
        row.targetType,
        row.targetId,
        row.adminPanelId,
        row.ip,
        row.geoCountry,
        row.geoCity,
        row.geoAsn,
        row.userAgent,
        row.jti,
        row.requestId,
        row.metadata ? JSON.stringify(row.metadata) : null,
      ]
        .map(csvCell)
        .join(','),
    );

    return [header.join(','), ...lines].join('\r\n');
  }

  /** How many rows an export WOULD return — so the cap is never silent. */
  count(query: AuditQueryDto): Promise<number> {
    return this.applyFilters(this.events.createQueryBuilder('event'), query).getCount();
  }

  private applyFilters(
    builder: SelectQueryBuilder<AuthAuditEventEntity>,
    query: AuditQueryDto,
  ): SelectQueryBuilder<AuthAuditEventEntity> {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('`from` must not be after `to`.');
    }

    // Every filter is an equality on an indexed or indexable column. There is
    // deliberately no free-text search: a LIKE '%…%' over this table is a full
    // scan of the platform's entire security history.
    const equals: [string, unknown][] = [
      ['event.event_type', query.eventType],
      ['event.outcome', query.outcome],
      ['event.actor_user_id', query.actorUserId],
      ['event.target_type', query.targetType],
      ['event.target_id', query.targetId],
      ['event.admin_panel_id', query.adminPanelId],
      ['event.ip', query.ip],
      ['event.geo_country', query.geoCountry],
      ['event.jti', query.jti],
      ['event.request_id', query.requestId],
    ];

    equals.forEach(([column, value], index) => {
      if (value === undefined) return;
      const parameter = `p${index}`;
      builder.andWhere(`${column} = :${parameter}`, { [parameter]: value });
    });

    if (query.from) builder.andWhere('event.created_at >= :from', { from: query.from });
    if (query.to) builder.andWhere('event.created_at <= :to', { to: query.to });

    return builder;
  }
}

export { EXPORT_MAX_ROWS };

/**
 * RFC 4180 quoting, plus a leading apostrophe on anything a spreadsheet would
 * execute.
 *
 * A `user_agent` or `metadata` value is attacker-influenced text, and Excel
 * treats a cell starting with `=`, `+`, `-` or `@` as a formula — so an
 * exported audit trail is a classic CSV-injection vector. The trail records
 * hostile input by definition, which makes this mandatory rather than
 * defensive.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  // Narrowed deliberately rather than accepting `unknown`: an object reaching
  // here would serialise as "[object Object]" and silently blank a column in a
  // security export. `metadata` is JSON-stringified by the caller for exactly
  // this reason.
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${guarded.replace(/"/g, '""')}"`;
}
