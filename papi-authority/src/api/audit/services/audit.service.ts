import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ClsService } from 'nestjs-cls';
import { Repository } from 'typeorm';

import { AuthAuditEventEntity } from '$/api/audit/entities/auth-audit-event.entity';
import { DataSourceName } from '$/constants/enums/config.enums';
import type { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';
import { GeoIpService } from '$/core/geoip/geoip.service';

import type { DeepPartial, EntityManager } from 'typeorm';

export interface AuditInput {
  eventType: AuthEventType;
  outcome: AuthEventOutcome;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  adminPanelId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  jti?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Writes the auth audit trail (dossier 0.37).
 *
 * **Failures are NOT swallowed.** papi-back's audit service catches every
 * persistence error and returns null, so an audit outage silently produces
 * unlogged authentications (dossier D.3b). Here the error propagates: an
 * unaudited authentication is a worse outcome than a failed one.
 *
 * That coupling costs nothing in practice — the audit table lives in the same
 * database as `users`, so if it is unreachable the login could not have been
 * authenticated anyway.
 *
 * Runs on the AUTHORITY connection, which holds INSERT but deliberately no
 * UPDATE or DELETE: even the writer cannot alter or erase the trail (0.25).
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuthAuditEventEntity, DataSourceName.Authority)
    private readonly events: Repository<AuthAuditEventEntity>,
    private readonly cls: ClsService,
    private readonly geoIp: GeoIpService,
  ) {}

  async record(input: AuditInput): Promise<void> {
    await this.events.save(this.events.create(this.rowFor(input)));
  }

  /**
   * Writes through a caller-supplied manager, so the audit row lands in the
   * SAME transaction as the action it records.
   *
   * This exists for the console connection (dossier 0.44): invitation approval
   * creates the user, applies the grants, audits, and deletes the invitation as
   * one atomic unit. Auditing over a second connection could not participate in
   * that transaction, and a crash between the two would leave a durable
   * "approved" event for a user that was never created — an audit trail that
   * lies is worse than one the console can append to.
   *
   * The console holds INSERT and nothing else on this table, so it can add to
   * the record but never edit or erase a row of it, including its own.
   *
   * `save` rather than `insert`: the UUIDv7 primary key is assigned by the
   * `@BeforeInsert` hook on `UuidEntity`, and TypeORM skips entity listeners
   * for a plain object literal — `insert({...})` would attempt a NULL id.
   */
  async recordWith(manager: EntityManager, input: AuditInput): Promise<void> {
    await manager.save(manager.create(AuthAuditEventEntity, this.rowFor(input)));
  }

  private rowFor(input: AuditInput): DeepPartial<AuthAuditEventEntity> {
    // Enrichment happens at WRITE time, not at read time. The geo database is
    // a snapshot: an address reassigned to another network six months from now
    // must not silently rewrite what an old event says about where a login
    // came from. The trail records what was known when it happened.
    const geo = this.geoIp.lookup(input.ip ?? null);

    return {
      eventType: input.eventType,
      outcome: input.outcome,
      actorUserId: input.actorUserId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      adminPanelId: input.adminPanelId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      jti: input.jti ?? null,
      requestId: this.cls.getId() ?? null,
      geoCountry: geo.country,
      geoCity: geo.city,
      geoAsn: geo.asn,
      metadata: input.metadata ?? null,
    };
  }
}
