import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthRuntimeSchema1785934941243 implements MigrationInterface {
  name = 'AuthRuntimeSchema1785934941243';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`auth_audit_events\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`actor_user_id\` char(36) NULL, \`event_type\` varchar(64) NOT NULL, \`outcome\` enum ('success', 'failure', 'denied') NOT NULL, \`target_type\` varchar(64) NULL, \`target_id\` varchar(64) NULL, \`admin_panel_id\` char(36) NULL, \`ip\` varchar(64) NULL, \`geo_country\` char(2) NULL, \`geo_city\` varchar(128) NULL, \`geo_asn\` varchar(64) NULL, \`user_agent\` varchar(512) NULL, \`jti\` char(36) NULL, \`request_id\` varchar(128) NULL, \`metadata\` json NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`idx_auth_audit_created\` (\`created_at\`), INDEX \`idx_auth_audit_type_created\` (\`event_type\`, \`created_at\`), INDEX \`idx_auth_audit_target\` (\`target_type\`, \`target_id\`), INDEX \`idx_auth_audit_actor_created\` (\`actor_user_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`login_lockouts\` (\`user_id\` char(36) NOT NULL, \`failure_count\` int UNSIGNED NOT NULL DEFAULT '0', \`last_failure_at\` datetime(6) NULL, \`locked_until\` datetime(6) NULL, \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`idx_login_lockouts_locked_until\` (\`locked_until\`), PRIMARY KEY (\`user_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`refresh_tokens\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`user_id\` char(36) NOT NULL, \`token_hash\` char(64) NOT NULL, \`family_id\` char(36) NOT NULL, \`issued_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`expires_at\` datetime(6) NOT NULL, \`revoked_at\` datetime(6) NULL, \`revoked_reason\` varchar(64) NULL, \`ip\` varchar(64) NULL, \`user_agent\` varchar(512) NULL, UNIQUE INDEX \`uq_refresh_tokens_hash\` (\`token_hash\`), INDEX \`idx_refresh_tokens_family\` (\`family_id\`), INDEX \`idx_refresh_tokens_user_expires\` (\`user_id\`, \`expires_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`two_factor_state\` (\`user_id\` char(36) NOT NULL, \`is_enabled\` tinyint NOT NULL DEFAULT 0, \`secret_encrypted\` varchar(255) NULL, \`pending_secret_encrypted\` varchar(255) NULL, \`pending_expires_at\` datetime(6) NULL, \`key_version\` smallint UNSIGNED NOT NULL DEFAULT '1', \`confirmed_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`user_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`invitations\` (\`id\` char(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`token_hash\` char(64) NOT NULL, \`email\` varchar(255) NOT NULL, \`status\` enum ('created', 'sent', 'accepted', 'rejected', 'expired') NOT NULL DEFAULT 'created', \`expires_at\` datetime(6) NOT NULL, \`sent_at\` datetime(6) NULL, \`accepted_at\` datetime(6) NULL, \`invited_by_user_id\` char(36) NULL, \`rejected_reason\` varchar(255) NULL, \`accepted_oid\` char(36) NULL, \`accepted_first_name\` varchar(100) NULL, \`accepted_last_name\` varchar(100) NULL, \`accepted_language\` varchar(2) NULL, \`role_id\` char(36) NULL, INDEX \`idx_invitations_status_expires\` (\`status\`, \`expires_at\`), INDEX \`idx_invitations_email\` (\`email\`), UNIQUE INDEX \`uq_invitations_token_hash\` (\`token_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`invitation_projects\` (\`invitation_id\` char(36) NOT NULL, \`project_id\` char(36) NOT NULL, INDEX \`IDX_b9a2b1f1835f0c256b021d6844\` (\`invitation_id\`), INDEX \`IDX_9490b4e370e68ddaaf7520ad0b\` (\`project_id\`), PRIMARY KEY (\`invitation_id\`, \`project_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`invitation_admin_panels\` (\`invitation_id\` char(36) NOT NULL, \`admin_panel_id\` char(36) NOT NULL, INDEX \`IDX_d8ab2781990a67106f23b821d4\` (\`invitation_id\`), INDEX \`IDX_b2472a3c100bdd1db77d242433\` (\`admin_panel_id\`), PRIMARY KEY (\`invitation_id\`, \`admin_panel_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`login_lockouts\` ADD CONSTRAINT \`FK_1f8f5b3a00155858eaa73edca97\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_3ddc983c5f7bcf132fd8732c3f4\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`two_factor_state\` ADD CONSTRAINT \`FK_38f45652401b2e99719e2c84945\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitations\` ADD CONSTRAINT \`FK_e4950c4d6aa2236f5213538e01a\` FOREIGN KEY (\`role_id\`) REFERENCES \`user_roles\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitation_projects\` ADD CONSTRAINT \`FK_b9a2b1f1835f0c256b021d6844e\` FOREIGN KEY (\`invitation_id\`) REFERENCES \`invitations\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitation_projects\` ADD CONSTRAINT \`FK_9490b4e370e68ddaaf7520ad0b6\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitation_admin_panels\` ADD CONSTRAINT \`FK_d8ab2781990a67106f23b821d4d\` FOREIGN KEY (\`invitation_id\`) REFERENCES \`invitations\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitation_admin_panels\` ADD CONSTRAINT \`FK_b2472a3c100bdd1db77d242433c\` FOREIGN KEY (\`admin_panel_id\`) REFERENCES \`admin_panels\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invitation_admin_panels\` DROP FOREIGN KEY \`FK_b2472a3c100bdd1db77d242433c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitation_admin_panels\` DROP FOREIGN KEY \`FK_d8ab2781990a67106f23b821d4d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitation_projects\` DROP FOREIGN KEY \`FK_9490b4e370e68ddaaf7520ad0b6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitation_projects\` DROP FOREIGN KEY \`FK_b9a2b1f1835f0c256b021d6844e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invitations\` DROP FOREIGN KEY \`FK_e4950c4d6aa2236f5213538e01a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`two_factor_state\` DROP FOREIGN KEY \`FK_38f45652401b2e99719e2c84945\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_3ddc983c5f7bcf132fd8732c3f4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`login_lockouts\` DROP FOREIGN KEY \`FK_1f8f5b3a00155858eaa73edca97\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_b2472a3c100bdd1db77d242433\` ON \`invitation_admin_panels\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_d8ab2781990a67106f23b821d4\` ON \`invitation_admin_panels\``,
    );
    await queryRunner.query(`DROP TABLE \`invitation_admin_panels\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_9490b4e370e68ddaaf7520ad0b\` ON \`invitation_projects\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_b9a2b1f1835f0c256b021d6844\` ON \`invitation_projects\``,
    );
    await queryRunner.query(`DROP TABLE \`invitation_projects\``);
    await queryRunner.query(`DROP INDEX \`uq_invitations_token_hash\` ON \`invitations\``);
    await queryRunner.query(`DROP INDEX \`idx_invitations_email\` ON \`invitations\``);
    await queryRunner.query(`DROP INDEX \`idx_invitations_status_expires\` ON \`invitations\``);
    await queryRunner.query(`DROP TABLE \`invitations\``);
    await queryRunner.query(`DROP TABLE \`two_factor_state\``);
    await queryRunner.query(`DROP INDEX \`idx_refresh_tokens_user_expires\` ON \`refresh_tokens\``);
    await queryRunner.query(`DROP INDEX \`idx_refresh_tokens_family\` ON \`refresh_tokens\``);
    await queryRunner.query(`DROP INDEX \`uq_refresh_tokens_hash\` ON \`refresh_tokens\``);
    await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
    await queryRunner.query(`DROP INDEX \`idx_login_lockouts_locked_until\` ON \`login_lockouts\``);
    await queryRunner.query(`DROP TABLE \`login_lockouts\``);
    await queryRunner.query(`DROP INDEX \`idx_auth_audit_actor_created\` ON \`auth_audit_events\``);
    await queryRunner.query(`DROP INDEX \`idx_auth_audit_target\` ON \`auth_audit_events\``);
    await queryRunner.query(`DROP INDEX \`idx_auth_audit_type_created\` ON \`auth_audit_events\``);
    await queryRunner.query(`DROP INDEX \`idx_auth_audit_created\` ON \`auth_audit_events\``);
    await queryRunner.query(`DROP TABLE \`auth_audit_events\``);
  }
}
