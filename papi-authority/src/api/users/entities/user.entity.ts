import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import type { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import type { UserProjectPermissionEntity } from '$/api/authorization/entities/user-project-permission.entity';
import type { ProjectEntity } from '$/api/projects/entities/project.entity';
import type { UserRoleEntity } from '$/api/users/entities/user-role.entity';
import { SoftDeletableEntity } from '$/core/orm/base.entity';

/**
 * The identity source of truth.
 *
 * Rows are created ONLY by the console DB principal — at invitation approval
 * (0.8/0.24) or by direct admin creation in password mode (0.18). The authority
 * principal holds SELECT plus a column-level UPDATE on the self-service fields
 * only, and can never INSERT, DELETE, or touch `is_active` / `oid` / grants
 * (0.20, 0.23).
 *
 * Deliberately ABSENT versus papi-back:
 *  - lockout columns  -> `login_lockouts`   (auth-runtime, 0.10)
 *  - all 2FA columns  -> `two_factor_state` (auth-runtime, 0.10/0.31)
 *  - `meta` JSON      -> permissions are normalized now (0.30); with L3 on the
 *                        role and L4 in `user_project_permissions`, there is no
 *                        "user-global permissions" layer left for it to hold.
 *  - `uid`            -> redundant: the primary key is already a UUID. In
 *                        papi-back `uid` is the intended external identifier
 *                        yet is neither unique nor indexed (dossier D.3c).
 *
 * Every unique constraint includes `deleted_at` (0.29), so soft-deleting a user
 * releases their email / username / oid for re-invitation.
 */
@Entity({ name: 'users' })
@Index('uq_users_email', ['email', 'deletedMarker'], { unique: true })
@Index('uq_users_username', ['username', 'deletedMarker'], { unique: true })
@Index('uq_users_oid', ['oid', 'deletedMarker'], { unique: true })
@Index('idx_users_is_active', ['isActive'])
export class UserEntity extends SoftDeletableEntity {
  /** Azure AD object id. NULL until the user completes an SSO join. */
  @Column({ name: 'oid', type: 'char', length: 36, nullable: true })
  oid!: string | null;

  @Column({ name: 'username', type: 'varchar', length: 100 })
  username!: string;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email!: string;

  /**
   * `varchar(255)`, not papi-back's `varchar(100)`. bcrypt fits in 60 chars but
   * an argon2id encoded hash runs ~96-100 and grows with parameters — 100 would
   * corner us at Phase 4 (dossier D.3c). NULL for SSO-only accounts.
   *
   * `select: false` so a hash is never loaded unless a caller asks for it.
   */
  @Column({ name: 'password', type: 'varchar', length: 255, nullable: true, select: false })
  password!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 100, nullable: true })
  phone!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  /** Forces a password change at next login (temporary-password flow, 0.22). */
  @Column({ name: 'is_sp_reset', type: 'boolean', default: false })
  isSpReset!: boolean;

  @Column({ name: 'sp_updated_at', type: 'datetime', precision: 6, nullable: true })
  spUpdatedAt!: Date | null;

  @Column({ name: 'language', type: 'varchar', length: 2, default: 'en' })
  language!: string;

  @Column({ name: 'timezone', type: 'varchar', length: 50, nullable: true })
  timezone!: string | null;

  /**
   * Reserved for a future near-instant revocation path (compare token `epoch`
   * against this value). NOT enforced in v1 — the access-token TTL is the
   * revocation ceiling (dossier B.8, Part N).
   */
  @Column({ name: 'token_epoch', type: 'int', unsigned: true, default: 0 })
  tokenEpoch!: number;

  @Column({ name: 'role_id', type: 'char', length: 36, nullable: true })
  roleId!: string | null;

  /**
   * RESTRICT, not CASCADE: deleting a role must never silently delete the
   * people who hold it. The console has to reassign them first.
   */
  @ManyToOne('UserRoleEntity', 'users', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role!: UserRoleEntity | null;

  /** L1 — project membership. */
  @ManyToMany('ProjectEntity', 'users', { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'user_projects',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'project_id', referencedColumnName: 'id' },
  })
  projects!: ProjectEntity[];

  /** Which admin panels this person may open at all. */
  @ManyToMany('AdminPanelEntity', 'users', { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'user_admin_panels',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'admin_panel_id', referencedColumnName: 'id' },
  })
  adminPanels!: AdminPanelEntity[];

  /** L4 — per-(user, project) overrides. */
  @OneToMany('UserProjectPermissionEntity', 'user')
  projectPermissions!: UserProjectPermissionEntity[];
}
