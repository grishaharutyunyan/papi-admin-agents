import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import type { PermissionCatalogEntity } from '$/api/authorization/entities/permission-catalog.entity';
import type { ProjectEntity } from '$/api/projects/entities/project.entity';
import type { UserEntity } from '$/api/users/entities/user.entity';
import { OverrideEffect, PermissionKind } from '$/constants/enums/domain.enums';

/**
 * L4 — per-(user, project) override. Scoped to ONE user on ONE project, which
 * is what makes it different from the role grant in L3.
 *
 * Composition is `(L2 ∩ L3) − L4[deny]`, gated by L1. Note this is a deliberate
 * departure from the forks, where a role REPLACES the user's own permissions
 * entirely rather than composing with them (dossier D.3c) — do not "restore"
 * that behaviour.
 */
@Entity({ name: 'user_project_permissions' })
@Index('idx_user_project_permissions_catalog', ['section', 'permissionKey', 'kind'])
@Index('idx_user_project_permissions_project', ['projectId'])
export class UserProjectPermissionEntity {
  @PrimaryColumn({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @PrimaryColumn({ name: 'project_id', type: 'char', length: 36 })
  projectId!: string;

  @PrimaryColumn({ name: 'section', type: 'varchar', length: 64 })
  section!: string;

  @PrimaryColumn({ name: 'permission_key', type: 'varchar', length: 64 })
  permissionKey!: string;

  @PrimaryColumn({ name: 'kind', type: 'enum', enum: PermissionKind })
  kind!: PermissionKind;

  /** `deny` subtracts; `grant` adds within the project's L2 ceiling. */
  @Column({ name: 'effect', type: 'enum', enum: OverrideEffect, default: OverrideEffect.Deny })
  effect!: OverrideEffect;

  @ManyToOne('UserEntity', 'projectPermissions', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne('ProjectEntity', { onDelete: 'CASCADE', nullable: false })
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
