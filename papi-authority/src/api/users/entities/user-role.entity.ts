import { Column, Entity, Index, OneToMany } from 'typeorm';

import type { RolePermissionEntity } from '$/api/authorization/entities/role-permission.entity';
import { SoftDeletableEntity } from '$/core/orm/base.entity';

/**
 * Table is `user_roles`, not papi-back's hyphenated `user-roles` — that name
 * requires backtick quoting in every raw statement forever, for no benefit.
 *
 * Permissions are NOT a JSON column here. They live in `role_permissions`, one
 * row per granted permission, foreign-keyed to `permission_catalog`
 * (dossier 0.30).
 */
@Entity({ name: 'user_roles' })
@Index('uq_user_roles_name', ['name', 'deletedMarker'], { unique: true })
export class UserRoleEntity extends SoftDeletableEntity {
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  /** papi-back calls this `public` — a reserved word in several engines. */
  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @OneToMany('RolePermissionEntity', 'role')
  permissions!: RolePermissionEntity[];
}
