import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import type { ProjectOperatorEntity } from '$/api/projects/entities/project-operator.entity';
import { OperatorType, RequiredLevel } from '$/constants/enums/domain.enums';
import { TimestampedEntity } from '$/core/orm/base.entity';

@Entity({ name: 'project_operator_op_types' })
@Index('idx_project_operator_op_types_operator', ['operatorId'])
export class ProjectOperatorOpTypeEntity extends TimestampedEntity {
  @Column({ name: 'operator_id', type: 'char', length: 36 })
  operatorId!: string;

  @ManyToOne('ProjectOperatorEntity', 'opTypes', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'operator_id' })
  operator!: ProjectOperatorEntity;

  @Column({ name: 'name', type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ name: 'type', type: 'enum', enum: OperatorType, default: OperatorType.In })
  type!: OperatorType;

  @Column({ name: 'auto_push_enabled', type: 'boolean', default: false })
  autoPushEnabled!: boolean;

  @Column({ name: 'auto_approve_enabled', type: 'boolean', default: false })
  autoApproveEnabled!: boolean;

  /** rmp leaves these nullable booleans (tri-state); defaulted to false here. */
  @Column({ name: 'manual_insert_status', type: 'boolean', default: false })
  manualInsertStatus!: boolean;

  @Column({ name: 'approved_trx_reports', type: 'boolean', default: false })
  approvedTrxReports!: boolean;

  @Column({
    name: 'payment_trx_id_required_level',
    type: 'enum',
    enum: RequiredLevel,
    default: RequiredLevel.Optional,
  })
  paymentTrxIdRequiredLevel!: RequiredLevel;

  @Column({
    name: 'remote_trx_id_required_level',
    type: 'enum',
    enum: RequiredLevel,
    default: RequiredLevel.Optional,
  })
  remoteTrxIdRequiredLevel!: RequiredLevel;

  @Column({
    name: 'reason_required_level',
    type: 'enum',
    enum: RequiredLevel,
    default: RequiredLevel.Optional,
  })
  reasonRequiredLevel!: RequiredLevel;

  /**
   * A real JSON column. rmp stores this as a JSON *string* in a `@Column` with
   * no `length`, which MySQL materializes as `varchar(255)` — a silent cap at
   * roughly 40 currency codes (dossier D.3c).
   */
  @Column({ name: 'currencies', type: 'json', nullable: true })
  currencies!: string[] | null;
}
