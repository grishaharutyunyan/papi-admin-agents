import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { UserEntity } from '$/api/users/entities/user.entity';

/**
 * All 2FA state, held in auth-runtime rather than on `users` (dossier 0.10).
 *
 * Secrets are stored ENCRYPTED (AES-GCM), never plaintext (0.31). papi-back
 * stores TOTP secrets in clear text and loads them on every user read, so a
 * single database dump there yields permanent second-factor bypass for every
 * account. Both secret columns are `select: false`, so nothing loads them
 * without asking.
 *
 * `key_version` records which encryption key produced the ciphertext, so keys
 * can be rotated without a flag day. Encryption itself is wired with the key
 * provider in Phase 3/4; Phase 2 only creates the columns.
 *
 * The console principal may DELETE a row here — that is the "user lost their
 * device, reset their enrollment" path — but has no INSERT/UPDATE, so it can
 * never plant a secret it knows (0.25).
 */
@Entity({ name: 'two_factor_state' })
export class TwoFactorStateEntity {
  @PrimaryColumn({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @OneToOne('UserEntity', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled!: boolean;

  @Column({ name: 'secret_encrypted', type: 'varchar', length: 255, nullable: true, select: false })
  secretEncrypted!: string | null;

  /** Enrollment in progress; discarded if not confirmed before it expires. */
  @Column({
    name: 'pending_secret_encrypted',
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  pendingSecretEncrypted!: string | null;

  @Column({ name: 'pending_expires_at', type: 'datetime', precision: 6, nullable: true })
  pendingExpiresAt!: Date | null;

  @Column({ name: 'key_version', type: 'smallint', unsigned: true, default: 1 })
  keyVersion!: number;

  @Column({ name: 'confirmed_at', type: 'datetime', precision: 6, nullable: true })
  confirmedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
