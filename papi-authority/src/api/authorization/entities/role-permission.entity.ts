import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import type { PermissionCatalogEntity } from '$/api/authorization/entities/permission-catalog.entity';
import type { UserRoleEntity } from '$/api/users/entities/user-role.entity';
import { PermissionKind } from '$/constants/enums/domain.enums';

/**
 * L3 — what a role grants. One row per permission, foreign-keyed into
 * `permission_catalog` (dossier 0.30), replacing the forks' opaque
 * `user-roles.permissions` JSON blob.
 */
@Entity({ name: 'role_permissions' })
@Index('idx_role_permissions_catalog', ['section', 'permissionKey', 'kind'])
export class RolePermissionEntity {
  @PrimaryColumn({ name: 'role_id', type: 'char', length: 36 })
  roleId!: string;

  @PrimaryColumn({ name: 'section', type: 'varchar', length: 64 })
  section!: string;

  @PrimaryColumn({ name: 'permission_key', type: 'varchar', length: 64 })
  permissionKey!: string;

  @PrimaryColumn({ name: 'kind', type: 'enum', enum: PermissionKind })
  kind!: PermissionKind;

  @ManyToOne('UserRoleEntity', 'permissions', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: UserRoleEntity;

  /**
   * RESTRICT: a catalog entry that is still granted to somebody must not vanish
   * from under them — removing it is a deliberate migration, not a side effect.
   */
  @ManyToOne('PermissionCatalogEntity', { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn([
    { name: 'section', referencedColumnName: 'section' },
    { name: 'permission_key', referencedColumnName: 'permissionKey' },
    { name: 'kind', referencedColumnName: 'kind' },
  ])
  permission!: PermissionCatalogEntity;
}
