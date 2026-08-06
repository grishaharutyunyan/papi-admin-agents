import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import type { ProjectOperatorOpTypeEntity } from '$/api/projects/entities/project-operator-op-type.entity';
import type { ProjectEntity } from '$/api/projects/entities/project.entity';
import { TimestampedEntity } from '$/core/orm/base.entity';

/**
 * Added over rmp: `UNIQUE (project_id, op_name)` — duplicate operator names
 * within a project are currently possible.
 */
@Entity({ name: 'project_operators' })
@Index('uq_project_operators_project_name', ['projectId', 'opName'], { unique: true })
export class ProjectOperatorEntity extends TimestampedEntity {
  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @ManyToOne('ProjectEntity', 'operators', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'op_name', type: 'varchar', length: 255 })
  opName!: string;

  @Column({ name: 'auto_push_enabled', type: 'boolean', default: false })
  autoPushEnabled!: boolean;

  @Column({ name: 'auto_approve_enabled', type: 'boolean', default: false })
  autoApproveEnabled!: boolean;

  @Column({ name: 'auto_push_exist', type: 'boolean', default: false })
  autoPushExist!: boolean;

  @Column({ name: 'auto_approve_exist', type: 'boolean', default: false })
  autoApproveExist!: boolean;

  /** rmp types this `string` while declaring it a timestamp — a real mismatch. */
  @Column({
    name: 'auto_approve_status_updated_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  autoApproveStatusUpdatedAt!: Date | null;

  @OneToMany('ProjectOperatorOpTypeEntity', 'operator')
  opTypes!: ProjectOperatorOpTypeEntity[];
}
