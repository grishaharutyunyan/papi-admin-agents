import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Platform-wide configuration. Exactly one row, enforced by the database
 * (dossier 0.9 / D5) — a second row would silently split the platform's default
 * Azure app registration, and "only one row" enforced in application code is a
 * rule that holds until the first direct SQL insert.
 *
 * Does not extend the UUID base: the singleton's identity is the constant 1.
 *
 * NOTE: the `id = 1` CHECK constraint and the seed row are emitted by the
 * initial migration, NOT by a `@Check()` decorator — TypeORM's MySQL driver
 * silently drops `@Check`, which would leave the guarantee documented in code
 * but absent from the database.
 */
@Entity({ name: 'platform_settings' })
export class PlatformSettingsEntity {
  @PrimaryColumn({ name: 'id', type: 'tinyint', unsigned: true, default: 1 })
  id!: number;

  /** Default Azure app registration; per-panel columns override when non-NULL. */
  @Column({ name: 'sso_tenant_id', type: 'varchar', length: 64, nullable: true })
  ssoTenantId!: string | null;

  @Column({ name: 'sso_client_id', type: 'varchar', length: 64, nullable: true })
  ssoClientId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
