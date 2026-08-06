import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { AuthEventOutcome } from '$/constants/enums/domain.enums';

/**
 * The auth audit trail (dossier B.15).
 *
 * Design constraints that shaped this table:
 *
 *  - **BIGINT primary key** (0.27). papi-back uses a signed `int`, a 2.1-billion
 *    row ceiling on an append-only log for a platform-wide identity service.
 *  - **No foreign keys, in either direction** — `actor_user_id` is a plain
 *    CHAR(36). Outbound: the trail must survive deletion of the account it
 *    describes. Inbound: nothing may reference audit rows, so the ~6-month
 *    retention purge stays a cheap range delete (0.28).
 *  - **Composite indexes for the queries auditors actually run.** papi-back
 *    indexes three columns singly, leaving "everything about target X" a full
 *    table scan and "actor X in a time range" only half covered.
 *  - **`event_type` is a varchar, not an enum**: adding an event type must
 *    never require DDL on a table this size.
 *  - The console principal holds **SELECT only** here (0.25) — it can read the
 *    entire trail and can never edit or erase it, including its own actions.
 */
@Entity({ name: 'auth_audit_events' })
@Index('idx_auth_audit_actor_created', ['actorUserId', 'createdAt'])
@Index('idx_auth_audit_target', ['targetType', 'targetId'])
@Index('idx_auth_audit_type_created', ['eventType', 'createdAt'])
@Index('idx_auth_audit_created', ['createdAt'])
export class AuthAuditEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  /** NULL for pre-authentication events (an unknown username, say). */
  @Column({ name: 'actor_user_id', type: 'char', length: 36, nullable: true })
  actorUserId!: string | null;

  /** Value from `AuthEventType`; the column stays open for new members. */
  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'outcome', type: 'enum', enum: AuthEventOutcome })
  outcome!: AuthEventOutcome;

  @Column({ name: 'target_type', type: 'varchar', length: 64, nullable: true })
  targetType!: string | null;

  @Column({ name: 'target_id', type: 'varchar', length: 64, nullable: true })
  targetId!: string | null;

  /** Which admin panel the action was performed against, when applicable. */
  @Column({ name: 'admin_panel_id', type: 'char', length: 36, nullable: true })
  adminPanelId!: string | null;

  /**
   * The client address. Only trustworthy because `trust proxy` is configured
   * explicitly at bootstrap — papi-back trusts `x-forwarded-for` blindly, which
   * makes this field attacker-controlled and the trail forgeable.
   *
   * Sized for IPv6 including a scope suffix.
   */
  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  /* ------------------------------------------- geo-IP enrichment (B.15) */

  @Column({ name: 'geo_country', type: 'char', length: 2, nullable: true })
  geoCountry!: string | null;

  @Column({ name: 'geo_city', type: 'varchar', length: 128, nullable: true })
  geoCity!: string | null;

  @Column({ name: 'geo_asn', type: 'varchar', length: 64, nullable: true })
  geoAsn!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  /** Access-token id, so an action can be tied back to the session that did it. */
  @Column({ name: 'jti', type: 'char', length: 36, nullable: true })
  jti!: string | null;

  /** Correlation id echoed from `x-request-id`. */
  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId!: string | null;

  /**
   * Structured detail. MUST NEVER contain secret material — no tokens, hashes,
   * key material, or password fields.
   */
  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;
}
