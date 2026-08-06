import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { uuidv7 } from '$/core/orm/uuid-v7';

import type { ValueTransformer } from 'typeorm';

/**
 * UUIDv7 primary key stored as CHAR(36) (dossier 0.27).
 *
 * v7 is time-ordered, so inserts append rather than scattering through the
 * clustered index the way v4 would, while still being unguessable (B.9).
 * CHAR(36) over BINARY(16) is deliberate: the DB team operates these databases
 * by hand, and a ValueTransformer bug on an identity primary key is a silent
 * catastrophe.
 */
export abstract class UuidEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @BeforeInsert()
  protected assignId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}

/**
 * `datetime(6)` throughout, never MySQL `TIMESTAMP`: TIMESTAMP has a 2038
 * ceiling and silently converts on read/write using the session timezone —
 * unacceptable for security-critical instants. papi-back uses TIMESTAMP for
 * `locked_until`, `expires_at`, `revoked_at` and friends (dossier D.3c).
 */
export abstract class TimestampedEntity extends UuidEntity {
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}

/**
 * Soft delete for identity tables only (dossier 0.29).
 *
 * Every unique constraint on a soft-deletable table MUST include `deleted_at`.
 * MySQL treats NULLs as distinct, so `UNIQUE (email, deleted_at)` permits one
 * live row plus unlimited tombstones. papi-back pairs soft delete with a plain
 * `UNIQUE`, which permanently burns a deleted user's email, username and Azure
 * `oid` — that person can never be re-invited.
 */
export abstract class SoftDeletableEntity extends TimestampedEntity {
  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', precision: 6, select: false })
  deletedAt!: Date | null;

  /**
   * Uniqueness discriminator for soft-deleted rows. NEVER write to it — MySQL
   * maintains it.
   *
   * `UNIQUE (email, deleted_at)` looks like it does this job but does NOT:
   * MySQL treats NULLs as DISTINCT in a unique index, so two live rows both
   * holding `deleted_at = NULL` do not collide and the constraint enforces
   * nothing. Verified against MySQL 8.4 — a duplicate live email was accepted.
   *
   * This column is `''` for every live row, so live duplicates collide, and the
   * row's own id once deleted, so any number of tombstones may share a value.
   * That gives exactly one live row per value while still releasing the
   * address for re-invitation.
   */
  @Column({
    name: 'deleted_marker',
    type: 'varchar',
    length: 36,
    asExpression: "IF(`deleted_at` IS NULL, '', `id`)",
    generatedType: 'STORED',
    select: false,
  })
  deletedMarker!: string;
}

/**
 * MySQL returns DECIMAL as a string to avoid float precision loss. Without this
 * the money columns silently arrive as strings and arithmetic concatenates.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number.parseFloat(value)),
};
