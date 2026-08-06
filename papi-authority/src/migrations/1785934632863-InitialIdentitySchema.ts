import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialIdentitySchema1785934632863 implements MigrationInterface {
  name = 'InitialIdentitySchema1785934632863';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`admin_panels\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`deleted_marker\` varchar(36) AS (IF(\`deleted_at\` IS NULL, '', \`id\`)) STORED NOT NULL, \`name\` varchar(100) NOT NULL, \`panel_key\` varchar(100) NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 0, \`theme\` varchar(30) NOT NULL DEFAULT 'default', \`basic_auth_enabled\` tinyint NOT NULL DEFAULT 0, \`sso_auth_enabled\` tinyint NOT NULL DEFAULT 0, \`sso_tenant_id\` varchar(64) NULL, \`sso_client_id\` varchar(64) NULL, UNIQUE INDEX \`uq_admin_panels_key\` (\`panel_key\`, \`deleted_marker\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `INSERT INTO \`typeorm_metadata\`(\`database\`, \`schema\`, \`table\`, \`type\`, \`name\`, \`value\`) VALUES (DEFAULT, ?, ?, ?, ?, ?)`,
      [
        'papi_authority',
        'admin_panels',
        'GENERATED_COLUMN',
        'deleted_marker',
        "IF(`deleted_at` IS NULL, '', `id`)",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE \`permission_catalog\` (\`section\` varchar(64) NOT NULL, \`permission_key\` varchar(64) NOT NULL, \`kind\` enum ('page', 'api') NOT NULL, \`description\` varchar(255) NULL, PRIMARY KEY (\`section\`, \`permission_key\`, \`kind\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`project_entitlements\` (\`project_id\` char(36) NOT NULL, \`section\` varchar(64) NOT NULL, \`permission_key\` varchar(64) NOT NULL, \`kind\` enum ('page', 'api') NOT NULL, INDEX \`idx_project_entitlements_catalog\` (\`section\`, \`permission_key\`, \`kind\`), PRIMARY KEY (\`project_id\`, \`section\`, \`permission_key\`, \`kind\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`role_permissions\` (\`role_id\` char(36) NOT NULL, \`section\` varchar(64) NOT NULL, \`permission_key\` varchar(64) NOT NULL, \`kind\` enum ('page', 'api') NOT NULL, INDEX \`idx_role_permissions_catalog\` (\`section\`, \`permission_key\`, \`kind\`), PRIMARY KEY (\`role_id\`, \`section\`, \`permission_key\`, \`kind\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`user_project_permissions\` (\`user_id\` char(36) NOT NULL, \`project_id\` char(36) NOT NULL, \`section\` varchar(64) NOT NULL, \`permission_key\` varchar(64) NOT NULL, \`kind\` enum ('page', 'api') NOT NULL, \`effect\` enum ('deny', 'grant') NOT NULL DEFAULT 'deny', INDEX \`idx_user_project_permissions_project\` (\`project_id\`), INDEX \`idx_user_project_permissions_catalog\` (\`section\`, \`permission_key\`, \`kind\`), PRIMARY KEY (\`user_id\`, \`project_id\`, \`section\`, \`permission_key\`, \`kind\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`platform_settings\` (\`id\` tinyint UNSIGNED NOT NULL DEFAULT '1', \`sso_tenant_id\` varchar(64) NULL, \`sso_client_id\` varchar(64) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`project_blockers\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`project_id\` char(36) NOT NULL, \`player_blockers\` json NULL, \`reason\` json NULL, UNIQUE INDEX \`REL_8ab0dd779ee4ce6aa00f639fac\` (\`project_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`project_limits\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`project_id\` char(36) NOT NULL, \`project_key\` varchar(255) NOT NULL, \`currency\` varchar(10) NOT NULL, \`daily_withdraw_limit\` decimal(18,2) NOT NULL DEFAULT '0.00', \`sport_winning_limit\` decimal(18,2) NOT NULL DEFAULT '0.00', \`casino_winning_limit\` decimal(18,2) NOT NULL DEFAULT '0.00', \`games_winning_limit\` decimal(18,2) NOT NULL DEFAULT '0.00', \`sport_ggr_limit\` decimal(18,2) NOT NULL DEFAULT '0.00', \`casino_ggr_limit\` decimal(18,2) NOT NULL DEFAULT '0.00', \`games_ggr_limit\` decimal(18,2) NOT NULL DEFAULT '0.00', \`used_unused_percentage\` decimal(18,2) NOT NULL DEFAULT '50.00', \`rollback_limit_percentage\` decimal(18,2) NULL DEFAULT '0.00', \`mi_limit\` decimal(10,0) NOT NULL DEFAULT '0', UNIQUE INDEX \`uq_project_limits_project_currency\` (\`project_id\`, \`currency\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`project_operator_op_types\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`operator_id\` char(36) NOT NULL, \`name\` varchar(255) NULL, \`type\` enum ('IN', 'OUT') NOT NULL DEFAULT 'IN', \`auto_push_enabled\` tinyint NOT NULL DEFAULT 0, \`auto_approve_enabled\` tinyint NOT NULL DEFAULT 0, \`manual_insert_status\` tinyint NOT NULL DEFAULT 0, \`approved_trx_reports\` tinyint NOT NULL DEFAULT 0, \`payment_trx_id_required_level\` enum ('NONE', 'OPTIONAL', 'REQUIRED') NOT NULL DEFAULT 'OPTIONAL', \`remote_trx_id_required_level\` enum ('NONE', 'OPTIONAL', 'REQUIRED') NOT NULL DEFAULT 'OPTIONAL', \`reason_required_level\` enum ('NONE', 'OPTIONAL', 'REQUIRED') NOT NULL DEFAULT 'OPTIONAL', \`currencies\` json NULL, INDEX \`idx_project_operator_op_types_operator\` (\`operator_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`project_operators\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`project_id\` char(36) NOT NULL, \`op_name\` varchar(255) NOT NULL, \`auto_push_enabled\` tinyint NOT NULL DEFAULT 0, \`auto_approve_enabled\` tinyint NOT NULL DEFAULT 0, \`auto_push_exist\` tinyint NOT NULL DEFAULT 0, \`auto_approve_exist\` tinyint NOT NULL DEFAULT 0, \`auto_approve_status_updated_at\` datetime(6) NULL, UNIQUE INDEX \`uq_project_operators_project_name\` (\`project_id\`, \`op_name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`projects\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`deleted_marker\` varchar(36) AS (IF(\`deleted_at\` IS NULL, '', \`id\`)) STORED NOT NULL, \`name\` varchar(100) NOT NULL, \`project\` varchar(255) NOT NULL, \`project_db\` varchar(255) NOT NULL, \`project_tz\` varchar(255) NULL, \`logo_url\` text NULL, \`is_active\` tinyint NOT NULL DEFAULT 0, \`theme\` varchar(30) NOT NULL DEFAULT 'default', \`is_using_bulk_tr\` tinyint NOT NULL DEFAULT 0, \`is_multi_currency\` tinyint NOT NULL DEFAULT 0, \`app_types\` json NULL, \`additional_trx_types\` json NULL, \`project_phone_country_code\` varchar(10) NULL, \`restore_bet_history_days_count\` int UNSIGNED NOT NULL DEFAULT '30', \`manual_check_exist\` tinyint NOT NULL DEFAULT 0, INDEX \`idx_projects_is_active\` (\`is_active\`), UNIQUE INDEX \`uq_projects_project_db\` (\`project_db\`, \`deleted_marker\`), UNIQUE INDEX \`uq_projects_project\` (\`project\`, \`deleted_marker\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `INSERT INTO \`typeorm_metadata\`(\`database\`, \`schema\`, \`table\`, \`type\`, \`name\`, \`value\`) VALUES (DEFAULT, ?, ?, ?, ?, ?)`,
      [
        'papi_authority',
        'projects',
        'GENERATED_COLUMN',
        'deleted_marker',
        "IF(`deleted_at` IS NULL, '', `id`)",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE \`user_roles\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`deleted_marker\` varchar(36) AS (IF(\`deleted_at\` IS NULL, '', \`id\`)) STORED NOT NULL, \`name\` varchar(100) NOT NULL, \`is_public\` tinyint NOT NULL DEFAULT 0, \`description\` varchar(255) NULL, UNIQUE INDEX \`uq_user_roles_name\` (\`name\`, \`deleted_marker\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `INSERT INTO \`typeorm_metadata\`(\`database\`, \`schema\`, \`table\`, \`type\`, \`name\`, \`value\`) VALUES (DEFAULT, ?, ?, ?, ?, ?)`,
      [
        'papi_authority',
        'user_roles',
        'GENERATED_COLUMN',
        'deleted_marker',
        "IF(`deleted_at` IS NULL, '', `id`)",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`deleted_marker\` varchar(36) AS (IF(\`deleted_at\` IS NULL, '', \`id\`)) STORED NOT NULL, \`oid\` char(36) NULL, \`username\` varchar(100) NOT NULL, \`email\` varchar(255) NOT NULL, \`password\` varchar(255) NULL, \`first_name\` varchar(100) NULL, \`last_name\` varchar(100) NULL, \`phone\` varchar(100) NULL, \`is_active\` tinyint NOT NULL DEFAULT 0, \`is_sp_reset\` tinyint NOT NULL DEFAULT 0, \`sp_updated_at\` datetime(6) NULL, \`language\` varchar(2) NOT NULL DEFAULT 'en', \`timezone\` varchar(50) NULL, \`token_epoch\` int UNSIGNED NOT NULL DEFAULT '0', \`role_id\` char(36) NULL, INDEX \`idx_users_is_active\` (\`is_active\`), UNIQUE INDEX \`uq_users_oid\` (\`oid\`, \`deleted_marker\`), UNIQUE INDEX \`uq_users_username\` (\`username\`, \`deleted_marker\`), UNIQUE INDEX \`uq_users_email\` (\`email\`, \`deleted_marker\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `INSERT INTO \`typeorm_metadata\`(\`database\`, \`schema\`, \`table\`, \`type\`, \`name\`, \`value\`) VALUES (DEFAULT, ?, ?, ?, ?, ?)`,
      [
        'papi_authority',
        'users',
        'GENERATED_COLUMN',
        'deleted_marker',
        "IF(`deleted_at` IS NULL, '', `id`)",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE \`user_projects\` (\`user_id\` char(36) NOT NULL, \`project_id\` char(36) NOT NULL, INDEX \`IDX_86ef6061f6f13aa9252b12cbe8\` (\`user_id\`), INDEX \`IDX_4c6aaf014ba0d66a74bb552272\` (\`project_id\`), PRIMARY KEY (\`user_id\`, \`project_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`user_admin_panels\` (\`user_id\` char(36) NOT NULL, \`admin_panel_id\` char(36) NOT NULL, INDEX \`IDX_fdad28cecab828c37a9e8d660d\` (\`user_id\`), INDEX \`IDX_da267d1cd8cb43d615a7e47936\` (\`admin_panel_id\`), PRIMARY KEY (\`user_id\`, \`admin_panel_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_entitlements\` ADD CONSTRAINT \`FK_419934e558c3da9c62522bc0812\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_entitlements\` ADD CONSTRAINT \`FK_f8ca791e78128e3a4592216e4d8\` FOREIGN KEY (\`section\`, \`permission_key\`, \`kind\`) REFERENCES \`permission_catalog\`(\`section\`,\`permission_key\`,\`kind\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`role_permissions\` ADD CONSTRAINT \`FK_178199805b901ccd220ab7740ec\` FOREIGN KEY (\`role_id\`) REFERENCES \`user_roles\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`role_permissions\` ADD CONSTRAINT \`FK_888d20ef4febc39d60384bd396d\` FOREIGN KEY (\`section\`, \`permission_key\`, \`kind\`) REFERENCES \`permission_catalog\`(\`section\`,\`permission_key\`,\`kind\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_project_permissions\` ADD CONSTRAINT \`FK_1b61a0c323bd6a18260f5bedb18\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_project_permissions\` ADD CONSTRAINT \`FK_9b1ea4bb460a9bd4b3dfd1f7dd5\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_project_permissions\` ADD CONSTRAINT \`FK_2532c7792c2d9c6753781635839\` FOREIGN KEY (\`section\`, \`permission_key\`, \`kind\`) REFERENCES \`permission_catalog\`(\`section\`,\`permission_key\`,\`kind\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_blockers\` ADD CONSTRAINT \`FK_8ab0dd779ee4ce6aa00f639fac1\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_limits\` ADD CONSTRAINT \`FK_51d085f2ecc5a9e05944f7e2eb1\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_operator_op_types\` ADD CONSTRAINT \`FK_c40b25f4cdf7aac63e6cd71fda9\` FOREIGN KEY (\`operator_id\`) REFERENCES \`project_operators\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_operators\` ADD CONSTRAINT \`FK_bfd37282d746279d5bfa4a9f17c\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_a2cecd1a3531c0b041e29ba46e1\` FOREIGN KEY (\`role_id\`) REFERENCES \`user_roles\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_projects\` ADD CONSTRAINT \`FK_86ef6061f6f13aa9252b12cbe87\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_projects\` ADD CONSTRAINT \`FK_4c6aaf014ba0d66a74bb5522726\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_admin_panels\` ADD CONSTRAINT \`FK_fdad28cecab828c37a9e8d660da\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_admin_panels\` ADD CONSTRAINT \`FK_da267d1cd8cb43d615a7e47936b\` FOREIGN KEY (\`admin_panel_id\`) REFERENCES \`admin_panels\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // --- Hand-written additions -------------------------------------
    // TypeORM's MySQL driver silently drops @Check(), so the singleton
    // guarantee has to be emitted here or it would not exist at all.
    await queryRunner.query(
      `ALTER TABLE \`platform_settings\` ADD CONSTRAINT \`chk_platform_settings_singleton\` CHECK (\`id\` = 1)`,
    );
    // Seed the singleton so no code path has to handle a missing row.
    await queryRunner.query(`INSERT INTO \`platform_settings\` (\`id\`) VALUES (1)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`platform_settings\` DROP CHECK \`chk_platform_settings_singleton\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_admin_panels\` DROP FOREIGN KEY \`FK_da267d1cd8cb43d615a7e47936b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_admin_panels\` DROP FOREIGN KEY \`FK_fdad28cecab828c37a9e8d660da\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_projects\` DROP FOREIGN KEY \`FK_4c6aaf014ba0d66a74bb5522726\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_projects\` DROP FOREIGN KEY \`FK_86ef6061f6f13aa9252b12cbe87\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_a2cecd1a3531c0b041e29ba46e1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_operators\` DROP FOREIGN KEY \`FK_bfd37282d746279d5bfa4a9f17c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_operator_op_types\` DROP FOREIGN KEY \`FK_c40b25f4cdf7aac63e6cd71fda9\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_limits\` DROP FOREIGN KEY \`FK_51d085f2ecc5a9e05944f7e2eb1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_blockers\` DROP FOREIGN KEY \`FK_8ab0dd779ee4ce6aa00f639fac1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_project_permissions\` DROP FOREIGN KEY \`FK_2532c7792c2d9c6753781635839\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_project_permissions\` DROP FOREIGN KEY \`FK_9b1ea4bb460a9bd4b3dfd1f7dd5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_project_permissions\` DROP FOREIGN KEY \`FK_1b61a0c323bd6a18260f5bedb18\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`role_permissions\` DROP FOREIGN KEY \`FK_888d20ef4febc39d60384bd396d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`role_permissions\` DROP FOREIGN KEY \`FK_178199805b901ccd220ab7740ec\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_entitlements\` DROP FOREIGN KEY \`FK_f8ca791e78128e3a4592216e4d8\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`project_entitlements\` DROP FOREIGN KEY \`FK_419934e558c3da9c62522bc0812\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_da267d1cd8cb43d615a7e47936\` ON \`user_admin_panels\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_fdad28cecab828c37a9e8d660d\` ON \`user_admin_panels\``,
    );
    await queryRunner.query(`DROP TABLE \`user_admin_panels\``);
    await queryRunner.query(`DROP INDEX \`IDX_4c6aaf014ba0d66a74bb552272\` ON \`user_projects\``);
    await queryRunner.query(`DROP INDEX \`IDX_86ef6061f6f13aa9252b12cbe8\` ON \`user_projects\``);
    await queryRunner.query(`DROP TABLE \`user_projects\``);
    await queryRunner.query(
      `DELETE FROM \`typeorm_metadata\` WHERE \`type\` = ? AND \`name\` = ? AND \`schema\` = ? AND \`table\` = ?`,
      ['GENERATED_COLUMN', 'deleted_marker', 'papi_authority', 'users'],
    );
    await queryRunner.query(`DROP INDEX \`uq_users_email\` ON \`users\``);
    await queryRunner.query(`DROP INDEX \`uq_users_username\` ON \`users\``);
    await queryRunner.query(`DROP INDEX \`uq_users_oid\` ON \`users\``);
    await queryRunner.query(`DROP INDEX \`idx_users_is_active\` ON \`users\``);
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(
      `DELETE FROM \`typeorm_metadata\` WHERE \`type\` = ? AND \`name\` = ? AND \`schema\` = ? AND \`table\` = ?`,
      ['GENERATED_COLUMN', 'deleted_marker', 'papi_authority', 'user_roles'],
    );
    await queryRunner.query(`DROP INDEX \`uq_user_roles_name\` ON \`user_roles\``);
    await queryRunner.query(`DROP TABLE \`user_roles\``);
    await queryRunner.query(
      `DELETE FROM \`typeorm_metadata\` WHERE \`type\` = ? AND \`name\` = ? AND \`schema\` = ? AND \`table\` = ?`,
      ['GENERATED_COLUMN', 'deleted_marker', 'papi_authority', 'projects'],
    );
    await queryRunner.query(`DROP INDEX \`uq_projects_project\` ON \`projects\``);
    await queryRunner.query(`DROP INDEX \`uq_projects_project_db\` ON \`projects\``);
    await queryRunner.query(`DROP INDEX \`idx_projects_is_active\` ON \`projects\``);
    await queryRunner.query(`DROP TABLE \`projects\``);
    await queryRunner.query(
      `DROP INDEX \`uq_project_operators_project_name\` ON \`project_operators\``,
    );
    await queryRunner.query(`DROP TABLE \`project_operators\``);
    await queryRunner.query(
      `DROP INDEX \`idx_project_operator_op_types_operator\` ON \`project_operator_op_types\``,
    );
    await queryRunner.query(`DROP TABLE \`project_operator_op_types\``);
    await queryRunner.query(
      `DROP INDEX \`uq_project_limits_project_currency\` ON \`project_limits\``,
    );
    await queryRunner.query(`DROP TABLE \`project_limits\``);
    await queryRunner.query(
      `DROP INDEX \`REL_8ab0dd779ee4ce6aa00f639fac\` ON \`project_blockers\``,
    );
    await queryRunner.query(`DROP TABLE \`project_blockers\``);
    await queryRunner.query(`DROP TABLE \`platform_settings\``);
    await queryRunner.query(
      `DROP INDEX \`idx_user_project_permissions_catalog\` ON \`user_project_permissions\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_user_project_permissions_project\` ON \`user_project_permissions\``,
    );
    await queryRunner.query(`DROP TABLE \`user_project_permissions\``);
    await queryRunner.query(`DROP INDEX \`idx_role_permissions_catalog\` ON \`role_permissions\``);
    await queryRunner.query(`DROP TABLE \`role_permissions\``);
    await queryRunner.query(
      `DROP INDEX \`idx_project_entitlements_catalog\` ON \`project_entitlements\``,
    );
    await queryRunner.query(`DROP TABLE \`project_entitlements\``);
    await queryRunner.query(`DROP TABLE \`permission_catalog\``);
    await queryRunner.query(
      `DELETE FROM \`typeorm_metadata\` WHERE \`type\` = ? AND \`name\` = ? AND \`schema\` = ? AND \`table\` = ?`,
      ['GENERATED_COLUMN', 'deleted_marker', 'papi_authority', 'admin_panels'],
    );
    await queryRunner.query(`DROP INDEX \`uq_admin_panels_key\` ON \`admin_panels\``);
    await queryRunner.query(`DROP TABLE \`admin_panels\``);
  }
}
