import { Column, Entity, Index, ManyToMany } from 'typeorm';

import type { UserEntity } from '$/api/users/entities/user.entity';
import { SoftDeletableEntity } from '$/core/orm/base.entity';

/**
 * An admin panel is a fork (rmp, cms, dmp, btms, mmp, nh-admin).
 *
 * Per-panel auth configuration lives here rather than in env (dossier 0.4/0.5),
 * so access-control can manage it later. The SSO columns are NULLABLE
 * OVERRIDES: NULL means "use the platform default from `platform_settings`"
 * (0.9). The whole platform normally shares one Azure app registration; these
 * exist as the escape hatch if a panel ever needs its own tenant.
 */
@Entity({ name: 'admin_panels' })
@Index('uq_admin_panels_key', ['panelKey', 'deletedMarker'], { unique: true })
export class AdminPanelEntity extends SoftDeletableEntity {
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  /**
   * Named `panel_key`, not `key` — reserved word in MySQL. Unique here; in
   * access-control it is not, despite driving per-fork DB routing.
   */
  @Column({ name: 'panel_key', type: 'varchar', length: 100 })
  panelKey!: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ name: 'theme', type: 'varchar', length: 30, default: 'default' })
  theme!: string;

  /* ------------------------------------------- per-panel auth modes (0.5) */

  /**
   * Enforced at login. If a panel is Azure-only, password login AND
   * change-password must both be rejected for it — there is no password to
   * change (dossier 0.22).
   */
  @Column({ name: 'basic_auth_enabled', type: 'boolean', default: false })
  basicAuthEnabled!: boolean;

  @Column({ name: 'sso_auth_enabled', type: 'boolean', default: false })
  ssoAuthEnabled!: boolean;

  @Column({ name: 'sso_tenant_id', type: 'varchar', length: 64, nullable: true })
  ssoTenantId!: string | null;

  @Column({ name: 'sso_client_id', type: 'varchar', length: 64, nullable: true })
  ssoClientId!: string | null;

  @ManyToMany('UserEntity', 'adminPanels', { onDelete: 'CASCADE' })
  users!: UserEntity[];
}
