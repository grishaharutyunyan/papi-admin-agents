import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import type { UserEntity } from '$/api/users/entities/user.entity';

/**
 * Rotating refresh tokens with family reuse-detection (dossier B.7).
 *
 * The plaintext token is 48 random bytes and is NEVER stored — only its
 * SHA-256. Presenting an already-revoked hash means the token was replayed, so
 * the entire family is revoked.
 *
 * Revocation is SOFT (`revoked_at`), never a delete: reuse-detection needs the
 * revoked row to persist, or a replayed token looks merely unknown instead of
 * triggering family revocation. This is also why the console principal gets
 * only `UPDATE (revoked_at)` here and never INSERT/UPDATE of the hash — a
 * compromised console must not be able to forge a session (dossier 0.25).
 *
 * BIGINT primary key (0.27): these rows are identified by their secret, never
 * by id, so there is nothing to enumerate.
 */
@Entity({ name: 'refresh_tokens' })
@Index('idx_refresh_tokens_user_expires', ['userId', 'expiresAt'])
@Index('idx_refresh_tokens_family', ['familyId'])
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  /**
   * Unlike papi-back this carries a real FK. There, orphan rows survive user
   * deletion and nothing ever purges them.
   */
  @ManyToOne('UserEntity', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  /** SHA-256 hex of the presented token — exactly 64 chars. */
  @Index('uq_refresh_tokens_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  /** All tokens rotated from one login share a family; reuse kills the family. */
  @Column({ name: 'family_id', type: 'char', length: 36 })
  familyId!: string;

  @CreateDateColumn({ name: 'issued_at', type: 'datetime', precision: 6 })
  issuedAt!: Date;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'datetime', precision: 6, nullable: true })
  revokedAt!: Date | null;

  /** e.g. rotated | reuse_detected | logout | unauthorized. Forensics need it. */
  @Column({ name: 'revoked_reason', type: 'varchar', length: 64, nullable: true })
  revokedReason!: string | null;

  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;
}
