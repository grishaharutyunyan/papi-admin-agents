import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuditModule } from '$/api/audit/audit.module';
import { AuthModule } from '$/api/auth/auth.module';
import { RefreshTokenEntity } from '$/api/auth/entities/refresh-token.entity';
import { PermissionCatalogEntity } from '$/api/authorization/entities/permission-catalog.entity';
import { RolePermissionEntity } from '$/api/authorization/entities/role-permission.entity';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { MeController } from '$/api/users/controllers/me.controller';
import { UserRolesController } from '$/api/users/controllers/user-roles.controller';
import { UsersController } from '$/api/users/controllers/users.controller';
import { UserRoleEntity } from '$/api/users/entities/user-role.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { MeService } from '$/api/users/services/me.service';
import { UserRolesService } from '$/api/users/services/user-roles.service';
import { UsersService } from '$/api/users/services/users.service';
import { SessionRevocationModule } from '$/api/users/session-revocation.module';
import { DataSourceName } from '$/constants/enums/config.enums';
import { CryptoModule } from '$/core/crypto/crypto.module';

/**
 * Identity administration — the module that spans BOTH runtime principals, and
 * the only one that does.
 *
 * - Admin CRUD (`UsersService`, `UserRolesService`) runs on the **console**
 *   connection: creating, deleting and re-granting identities.
 * - Self-service (`MeService`) runs on the **authority** connection, whose
 *   entire identity write authority is a column-level UPDATE on the profile and
 *   password fields (dossier 0.45).
 *
 * Splitting them is the point. A defect on the self-service path cannot change
 * a role or a project grant, because the principal it runs under has no
 * privilege to do so — the boundary is the DB grant, not the code.
 *
 * **Controller order is load-bearing.** `MeController` (`users/me`) must be
 * registered before `UsersController` (`users/:id`), or `/api/users/me` reaches
 * the `:id` route. `:id` carries a `ParseUUIDPipe`, so a mis-ordering yields a
 * 400 rather than a mis-routed request — loud, but still a failure.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity], DataSourceName.Authority),
    TypeOrmModule.forFeature(
      [
        UserEntity,
        UserRoleEntity,
        RolePermissionEntity,
        PermissionCatalogEntity,
        ProjectEntity,
        AdminPanelEntity,
        RefreshTokenEntity,
      ],
      DataSourceName.Console,
    ),
    AuditModule,
    CryptoModule,
    AuthModule,
    SessionRevocationModule,
  ],
  controllers: [MeController, UsersController, UserRolesController],
  providers: [UsersService, UserRolesService, MeService],
})
export class UsersModule {}
