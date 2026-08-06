import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

import type { ProjectEntity } from '$/api/projects/entities/project.entity';
import { TimestampedEntity } from '$/core/orm/base.entity';

/**
 * rmp declares this `@OneToOne` on the project side but `@ManyToOne` with no
 * unique constraint on this side, so its database permits N blocker rows per
 * project while the application silently reads one (dossier D.3c). Here the
 * UNIQUE constraint makes the 1-1 real — emitted automatically by
 * `@OneToOne` + `@JoinColumn`, so no explicit @Index is needed (adding one
 * produces a second, redundant unique index on the same column).
 *
 * rmp's `toSnakeCase`/`toCamelCase` transformer pair is deliberately NOT ported:
 * `toSnakeCase` only accepts a string and would throw on the object and array
 * values both columns actually hold. It survives there only because no write
 * path exists.
 */
@Entity({ name: 'project_blockers' })
export class ProjectBlockerEntity extends TimestampedEntity {
  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @OneToOne('ProjectEntity', 'blockers', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'player_blockers', type: 'json', nullable: true })
  playerBlockers!: Record<string, unknown> | null;

  @Column({ name: 'reason', type: 'json', nullable: true })
  reason!: string[] | null;
}
