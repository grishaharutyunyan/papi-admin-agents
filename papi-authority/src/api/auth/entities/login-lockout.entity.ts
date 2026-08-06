import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { UserEntity } from '$/api/users/entities/user.entity';

/**
 * Per-user lockout state (dossier 0.10).
 *
 * This lives in auth-runtime rather than on `users` for a specific reason: it
 * is the only mutable security state the auth engine needs to WRITE during a
 * login. Keeping it here is what lets `users` stay free of any authority-write
 * except the narrow self-service columns of 0.23 — the auth engine can count
 * failures without ever holding INSERT/DELETE on the identity table.
 *
 * Keyed by `user_id`: one row per user, created lazily on first failure.
 */
@Entity({ name: 'login_lockouts' })
@Index('idx_login_lockouts_locked_until', ['lockedUntil'])
export class LoginLockoutEntity {
  @PrimaryColumn({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @OneToOne('UserEntity', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'failure_count', type: 'int', unsigned: true, default: 0 })
  failureCount!: number;

  @Column({ name: 'last_failure_at', type: 'datetime', precision: 6, nullable: true })
  lastFailureAt!: Date | null;

  /** NULL means not locked. Past means the lock has lapsed. */
  @Column({ name: 'locked_until', type: 'datetime', precision: 6, nullable: true })
  lockedUntil!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
