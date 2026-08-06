import 'reflect-metadata';

import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { ProjectEntitlementEntity } from '$/api/authorization/entities/project-entitlement.entity';
import { RolePermissionEntity } from '$/api/authorization/entities/role-permission.entity';
import { flattenCatalog } from '$/api/authorization/permission-catalog';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { UserRoleEntity } from '$/api/users/entities/user-role.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { ALL_ENTITIES } from '$/core/orm/entities';

/**
 * Development seeder.
 *
 * Connects as `papi_migrator` deliberately: seeding is a developer operation,
 * not a production code path, and running it through the least-privilege
 * runtime principals would either fail or require widening their grants.
 * Real environments are provisioned by the DB team (dossier 0.26) and never run
 * this file.
 *
 * Idempotent — safe to re-run.
 *
 * Password mode per 0.18: the admin user is created DIRECTLY, not through an
 * invitation. Invitations exist only for Azure/SSO onboarding.
 */
loadDotenv();

async function seed(): Promise<void> {
  const url = process.env.DB_MIGRATOR_URI;
  if (!url) throw new Error('DB_MIGRATOR_URI must be set to run the seeder.');

  const dataSource = new DataSource({
    type: 'mysql',
    url,
    entities: ALL_ENTITIES,
    synchronize: false,
  });
  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      // The permission catalog is owned by code and materialised by migration
      // (dossier 0.38) — the seeder must never write it. `papi_console` cannot
      // write it either; only `papi_migrator` may.
      const catalog = flattenCatalog();

      // 2. Admin panel — password auth on so the service is testable without
      //    Azure (0.5); SSO columns are NULL so the platform default applies.
      const panelRepo = manager.getRepository(AdminPanelEntity);
      let panel = await panelRepo.findOne({ where: { panelKey: 'RMP' } });
      panel ??= panelRepo.create({ name: 'Risk Management Platform', panelKey: 'RMP' });
      panel.isActive = true;
      panel.basicAuthEnabled = true;
      panel.ssoAuthEnabled = false;
      await panelRepo.save(panel);

      // 3. Project.
      const projectRepo = manager.getRepository(ProjectEntity);
      let project = await projectRepo.findOne({ where: { project: 'PMBETTZ' } });
      project ??= projectRepo.create({
        name: 'PMBETTZ',
        project: 'PMBETTZ',
        projectDb: 'pmbettz_db',
      });
      project.isActive = true;
      await projectRepo.save(project);

      // 4. Role + its L3 permissions (every catalog entry).
      const roleRepo = manager.getRepository(UserRoleEntity);
      let role = await roleRepo.findOne({ where: { name: 'platform-admin' } });
      role ??= roleRepo.create({ name: 'platform-admin', description: 'Full access (dev seed)' });
      role.isPublic = false;
      await roleRepo.save(role);

      await manager.upsert(
        RolePermissionEntity,
        catalog.map((entry) => ({
          roleId: role.id,
          section: entry.section,
          permissionKey: entry.permissionKey,
          kind: entry.kind,
        })),
        ['roleId', 'section', 'permissionKey', 'kind'],
      );

      // 5. L2 — the project is licensed for everything in the catalog.
      await manager.upsert(
        ProjectEntitlementEntity,
        catalog.map((entry) => ({
          projectId: project.id,
          section: entry.section,
          permissionKey: entry.permissionKey,
          kind: entry.kind,
        })),
        ['projectId', 'section', 'permissionKey', 'kind'],
      );

      // 6. Admin user, created directly (0.18 — no invitation in password mode).
      const userRepo = manager.getRepository(UserEntity);
      let user = await userRepo.findOne({
        where: { username: 'admin' },
        relations: { projects: true, adminPanels: true },
      });
      user ??= userRepo.create({ username: 'admin', email: 'admin@nrg.local' });
      user.isActive = true;
      user.roleId = role.id;
      user.firstName = 'Platform';
      user.lastName = 'Admin';
      // Credentials are NOT seeded here: the password hashing algorithm
      // (argon2id vs bcrypt) is decided at Phase 4, and writing a hash in a
      // format we may not keep would be worse than leaving it unset.
      // `is_sp_reset` forces a change at first login once that exists (0.22).
      user.password = null;
      user.isSpReset = true;
      user.projects = [project];
      user.adminPanels = [panel];
      await userRepo.save(user);
    });

    console.log(
      [
        'papi-authority seed complete:',
        '  admin panel : RMP (basic auth enabled, SSO disabled)',
        '  project     : PMBETTZ',
        '  role        : platform-admin (all catalog permissions)',
        '  user        : admin / admin@nrg.local  [no password — set at Phase 4]',
        `  catalog     : ${flattenCatalog().length} permissions (from code)`,
      ].join('\n'),
    );
  } finally {
    await dataSource.destroy();
  }
}

void seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
