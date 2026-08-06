import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import type { ProjectEntity } from '$/api/projects/entities/project.entity';
import { decimalTransformer, TimestampedEntity } from '$/core/orm/base.entity';

const MONEY = {
  type: 'decimal',
  precision: 18,
  scale: 2,
  transformer: decimalTransformer,
} as const;

/**
 * Ported from rmp with its exact precisions and defaults (re-verified).
 *
 * Added: `UNIQUE (project_id, currency)`. rmp has no such constraint, so
 * duplicate limit rows for one currency are possible today and whichever row
 * the query happens to return wins.
 */
@Entity({ name: 'project_limits' })
@Index('uq_project_limits_project_currency', ['projectId', 'currency'], { unique: true })
export class ProjectLimitEntity extends TimestampedEntity {
  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @ManyToOne('ProjectEntity', 'limits', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'project_key', type: 'varchar', length: 255 })
  projectKey!: string;

  /** ISO-4217 sized, not rmp's varchar(255). */
  @Column({ name: 'currency', type: 'varchar', length: 10 })
  currency!: string;

  @Column({ name: 'daily_withdraw_limit', ...MONEY, default: 0 })
  dailyWithdrawLimit!: number;

  @Column({ name: 'sport_winning_limit', ...MONEY, default: 0 })
  sportWinningLimit!: number;

  @Column({ name: 'casino_winning_limit', ...MONEY, default: 0 })
  casinoWinningLimit!: number;

  @Column({ name: 'games_winning_limit', ...MONEY, default: 0 })
  gamesWinningLimit!: number;

  @Column({ name: 'sport_ggr_limit', ...MONEY, default: 0 })
  sportGgrLimit!: number;

  @Column({ name: 'casino_ggr_limit', ...MONEY, default: 0 })
  casinoGgrLimit!: number;

  @Column({ name: 'games_ggr_limit', ...MONEY, default: 0 })
  gamesGgrLimit!: number;

  @Column({ name: 'used_unused_percentage', ...MONEY, default: 50.0 })
  usedUnusedPercentage!: number;

  @Column({ name: 'rollback_limit_percentage', ...MONEY, nullable: true, default: 0 })
  rollbackLimitPercentage!: number | null;

  @Column({
    name: 'mi_limit',
    type: 'decimal',
    precision: 10,
    scale: 0,
    transformer: decimalTransformer,
    default: 0,
  })
  miLimit!: number;
}
