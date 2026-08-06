import { Column, Entity, PrimaryColumn } from 'typeorm';

import { PermissionKind } from '$/constants/enums/domain.enums';

/**
 * The referential anchor for every permission grant (dossier 0.30).
 *
 * L2 entitlements, L3 role permissions and L4 overrides all carry a foreign key
 * into this table, so a grant naming a permission that does not exist becomes
 * impossible rather than merely unlikely. This is what normalized storage buys
 * over the forks' opaque `IMetaPermissions` JSON — which is additionally not
 * portable between forks at all: papi-back writes the section key
 * `"usersSection"` where rmp writes `"users"` for the same section.
 *
 * Rows are owned by the Phase 5 code catalog and kept in sync by its codegen
 * check. Nothing else may insert here.
 */
@Entity({ name: 'permission_catalog' })
export class PermissionCatalogEntity {
  @PrimaryColumn({ name: 'section', type: 'varchar', length: 64 })
  section!: string;

  /** Named `permission_key`, not `key` — `key` is reserved in MySQL. */
  @PrimaryColumn({ name: 'permission_key', type: 'varchar', length: 64 })
  permissionKey!: string;

  @PrimaryColumn({ name: 'kind', type: 'enum', enum: PermissionKind })
  kind!: PermissionKind;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;
}
