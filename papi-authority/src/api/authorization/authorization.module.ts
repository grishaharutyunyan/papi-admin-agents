import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '$/api/audit/audit.module';
import { EntitlementsController } from '$/api/authorization/controllers/entitlements.controller';
import { PermissionCatalogEntity } from '$/api/authorization/entities/permission-catalog.entity';
import { ProjectEntitlementEntity } from '$/api/authorization/entities/project-entitlement.entity';
import { RolePermissionEntity } from '$/api/authorization/entities/role-permission.entity';
import { UserProjectPermissionEntity } from '$/api/authorization/entities/user-project-permission.entity';
import { EntitlementsService } from '$/api/authorization/services/entitlements.service';
import { PermissionResolverService } from '$/api/authorization/services/permission-resolver.service';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { SessionRevocationModule } from '$/api/users/session-revocation.module';
import { DataSourceName } from '$/constants/enums/config.enums';

/**
 * Both directions of the permission model.
 *
 * `PermissionResolverService` READS all four layers on the **authority**
 * connection — that principal has SELECT on every grant table and write access
 * to none of them, so the code that decides what a token may do cannot alter
 * what anyone is granted.
 *
 * `EntitlementsService` WRITES L2 and L4 on the **console** connection. Two
 * services, two principals, one module: reading and granting a permission are
 * different privileges and are executed as different database users.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [RolePermissionEntity, ProjectEntitlementEntity, UserProjectPermissionEntity],
      DataSourceName.Authority,
    ),
    TypeOrmModule.forFeature(
      [
        ProjectEntitlementEntity,
        UserProjectPermissionEntity,
        PermissionCatalogEntity,
        ProjectEntity,
        UserEntity,
      ],
      DataSourceName.Console,
    ),
    AuditModule,
    SessionRevocationModule,
  ],
  controllers: [EntitlementsController],
  providers: [PermissionResolverService, EntitlementsService],
  exports: [PermissionResolverService],
})
export class AuthorizationModule {}
