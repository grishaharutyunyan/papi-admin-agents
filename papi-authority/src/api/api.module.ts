import { Module } from '@nestjs/common';

import { AdminPanelsModule } from '$/api/admin-panels/admin-panels.module';
import { AppInitModule } from '$/api/app-init/app-init.module';
import { AuthModule } from '$/api/auth/auth.module';
import { AuthorizationModule } from '$/api/authorization/authorization.module';
import { InvitationsModule } from '$/api/invitations/invitations.module';
import { PlatformSettingsModule } from '$/api/platform-settings/platform-settings.module';
import { ProjectsModule } from '$/api/projects/projects.module';
import { SsoModule } from '$/api/sso/sso.module';
import { UsersModule } from '$/api/users/users.module';

/**
 * Root of the service's HTTP API surface.
 *
 * Routing convention: the `api` prefix comes from `app.setGlobalPrefix('api')`
 * in `main.ts`, and each controller supplies its own segment — so a route is
 * `/api/auth/login`. There is NO URI versioning (dossier decision 0.17), and we
 * deliberately do not use papi-back's `RouterModule.register` triple-listing,
 * where omitting a module from one of three lists silently drops its prefix.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProjectsModule,
    AdminPanelsModule,
    AppInitModule,
    AuthorizationModule,
    PlatformSettingsModule,
    InvitationsModule,
    SsoModule,
  ],
})
export class ApiModule {}
