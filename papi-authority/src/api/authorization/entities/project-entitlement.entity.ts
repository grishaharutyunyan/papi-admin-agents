import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import type { PermissionCatalogEntity } from '$/api/authorization/entities/permission-catalog.entity';
import type { ProjectEntity } from '$/api/projects/entities/project.entity';
import { PermissionKind } from '$/constants/enums/domain.enums';

/**
 * L2 — what a PROJECT is licensed for. This gates every user on the project
 * before any user-level permission is consulted (dossier F.5): if a project
 * lacks the entitlement, nobody on it gets the page or api, whatever their role
 * says.
 */
@Entity({ name: 'project_entitlements' })
@Index('idx_project_entitlements_catalog', ['section', 'permissionKey', 'kind'])
export class ProjectEntitlementEntity {
  @PrimaryColumn({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @PrimaryColumn({ name: 'section', type: 'varchar', length: 64 })
  section!: string;

  @PrimaryColumn({ name: 'permission_key', type: 'varchar', length: 64 })
  permissionKey!: string;

  @PrimaryColumn({ name: 'kind', type: 'enum', enum: PermissionKind })
  kind!: PermissionKind;

  @ManyToOne('ProjectEntity', 'entitlements', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @ManyToOne('PermissionCatalogEntity', { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn([
    { name: 'section', referencedColumnName: 'section' },
    { name: 'permission_key', referencedColumnName: 'permissionKey' },
    { name: 'kind', referencedColumnName: 'kind' },
  ])
  permission!: PermissionCatalogEntity;
}
