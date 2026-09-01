import { Module } from '@nestjs/common';

import { AppInitModule } from '$/api/app-init/app-init.module';
import { AuthModule } from '$/api/auth/auth.module';
import { ExternalSystemModule } from '$/api/external-system/external-system.module';
import { SsoModule } from '$/api/sso/sso.module';
import { UsersModule } from '$/api/users/users.module';

/**
 * Root of the service's HTTP API surface.
 *
 * Routing convention: the `api` prefix comes from `app.setGlobalPrefix('api')`
 * in `main.ts`, and each controller supplies its own segment — so a route is
 * `/api/app-init`, `/api/auth/...`, `/api/sso/login`, `/api/users/me...`,
 * `/api/external-system/...`. There is NO URI versioning, and this
 * deliberately does not use old papi-back's `RouterModule.register`
 * triple-listing, where omitting a module from one of three lists silently
 * drops its prefix.
 */
@Module({
  imports: [AppInitModule, AuthModule, SsoModule, UsersModule, ExternalSystemModule],
})
export class ApiModule {}
