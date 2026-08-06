import { Column, Entity, Index, ManyToMany, OneToMany, OneToOne } from 'typeorm';

import type { ProjectEntitlementEntity } from '$/api/authorization/entities/project-entitlement.entity';
import type { ProjectBlockerEntity } from '$/api/projects/entities/project-blocker.entity';
import type { ProjectLimitEntity } from '$/api/projects/entities/project-limit.entity';
import type { ProjectOperatorEntity } from '$/api/projects/entities/project-operator.entity';
import type { UserEntity } from '$/api/users/entities/user.entity';
import { SoftDeletableEntity } from '$/core/orm/base.entity';

/**
 * The combined superset: papi-back's base 8 + rmp's 7 extras (dossier D.3/D.5,
 * re-verified 2026-08-05). dmp's only extra is already inside rmp's set.
 *
 * Improvements over every fork's copy: timestamps and soft delete exist,
 * `project` and `project_db` are actually UNIQUE (they drive tenant routing and
 * are unconstrained today), and no relation is `eager` — rmp eagerly loads
 * operators and limits on a relation the guard resolves on nearly every
 * request.
 */
@Entity({ name: 'projects' })
@Index('uq_projects_project', ['project', 'deletedMarker'], { unique: true })
@Index('uq_projects_project_db', ['projectDb', 'deletedMarker'], { unique: true })
@Index('idx_projects_is_active', ['isActive'])
export class ProjectEntity extends SoftDeletableEntity {
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  /** Slug / code used for tenant routing. */
  @Column({ name: 'project', type: 'varchar', length: 255 })
  project!: string;

  /** Per-tenant database name. */
  @Column({ name: 'project_db', type: 'varchar', length: 255 })
  projectDb!: string;

  @Column({ name: 'project_tz', type: 'varchar', length: 255, nullable: true })
  projectTz!: string | null;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ name: 'theme', type: 'varchar', length: 30, default: 'default' })
  theme!: string;

  /* ------------------------------------------------- rmp superset extras */

  @Column({ name: 'is_using_bulk_tr', type: 'boolean', default: false })
  isUsingBulkTr!: boolean;

  @Column({ name: 'is_multi_currency', type: 'boolean', default: false })
  isMultiCurrency!: boolean;

  @Column({ name: 'app_types', type: 'json', nullable: true })
  appTypes!: string[] | null;

  @Column({ name: 'additional_trx_types', type: 'json', nullable: true })
  additionalTrxTypes!: string[] | null;

  @Column({ name: 'project_phone_country_code', type: 'varchar', length: 10, nullable: true })
  projectPhoneCountryCode!: string | null;

  /**
   * `int`, not rmp's `numeric(10,0)` + parseFloat transformer. It is a count of
   * days; DECIMAL bought nothing and forced a transformer to avoid the value
   * arriving as a string.
   */
  @Column({ name: 'restore_bet_history_days_count', type: 'int', unsigned: true, default: 30 })
  restoreBetHistoryDaysCount!: number;

  @Column({ name: 'manual_check_exist', type: 'boolean', default: false })
  manualCheckExist!: boolean;

  /* --------------------------------------------------------- relations */

  @OneToMany('ProjectLimitEntity', 'project')
  limits!: ProjectLimitEntity[];

  @OneToMany('ProjectOperatorEntity', 'project')
  operators!: ProjectOperatorEntity[];

  /** A real 1-1: `project_blockers.project_id` carries a UNIQUE constraint. */
  @OneToOne('ProjectBlockerEntity', 'project')
  blockers!: ProjectBlockerEntity | null;

  /** L2 — what this project is licensed for. */
  @OneToMany('ProjectEntitlementEntity', 'project')
  entitlements!: ProjectEntitlementEntity[];

  @ManyToMany('UserEntity', 'projects', { onDelete: 'CASCADE' })
  users!: UserEntity[];
}
