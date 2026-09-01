import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { ClsModule } from 'nestjs-cls';

import { ApiModule } from '$/api/api.module';
import { validateEnv } from '$/configs/env.schema';
import { configurations, throttleConfig } from '$/configs/index.configs';
import { HealthModule } from '$/core/health/health.module';
import { HttpClientModule } from '$/core/http-client/http-client.module';
import { JwksModule } from '$/core/jwks/jwks.module';
import { requestIdFrom } from '$/core/request-context/request-id';
import { ShutdownModule } from '$/core/shutdown/shutdown.module';
import { AUTH_THROTTLE_KEY } from '$/decorators/public.decorator';
import { JwtGuard } from '$/guards/jwt.guard';
import { PermissionGuard } from '$/guards/permission.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configurations,
      validate: validateEnv,
    }),

    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        // Reads the header normalized by requestIdMiddleware, so the CLS id
        // and the echoed response header are always the same value.
        idGenerator: requestIdFrom,
      },
    }),

    /**
     * Two named buckets, same shape as papi-authority's. Only the `default`
     * bucket is global — the tighter `auth` bucket is registered here but
     * exempts every route without `@AuthThrottle()` via `skipIf`, so it does
     * nothing until Phase 3's login/refresh/SSO proxy routes opt in.
     */
    ThrottlerModule.forRootAsync({
      inject: [throttleConfig.KEY],
      useFactory: (config: ConfigType<typeof throttleConfig>) => ({
        throttlers: [
          { name: 'default', ttl: config.default.ttl, limit: config.default.limit },
          {
            name: 'auth',
            ttl: config.auth.ttl,
            limit: config.auth.limit,
            skipIf: (context) =>
              Reflect.getMetadata(AUTH_THROTTLE_KEY, context.getHandler()) !== true,
          },
        ],
      }),
    }),

    ShutdownModule,
    HealthModule,
    JwksModule,

    /**
     * Phase 6 — generic, opt-in infrastructure modules (module inventory
     * Part R.3). `HttpClientModule` is always-on infra, not gated. The
     * other four are each gated by their own `<NS>_ENABLED` flag internally
     * (see each module's own doc comment for how the gate works) — they are
     * imported here unconditionally so a fork can always inject their
     * services, and so the enabled/disabled factory logic actually runs at
     * real boot regardless of which flags are set.
     */
    HttpClientModule,

    ApiModule,
  ],
  providers: [
    /**
     * Guard order: throttle -> authenticate -> authorize (same convention as
     * papi-authority and old papi-back). `PermissionGuard` (Phase 4) runs
     * last, after `JwtGuard` has attached `request.tokenClaims` — it reads
     * that trusted claims object only, never re-verifying the token and never
     * calling papi-authority.
     *
     * `JwtGuard` is default-ON for every route not marked `@Public()` —
     * applying papi-authority's own hard-learned lesson immediately: `/live`,
     * `/ready` and `GET /api/app-init` (Phase 1) all already carry
     * `@Public()`, so they stay reachable; anything added from here without
     * the decorator becomes unreachable rather than silently unauthenticated.
     *
     * `PermissionGuard` is default-DENY: an authenticated, non-public route
     * with none of `@RequirePermissions`/`@PlatformPermissions`/
     * `@SkipPermissions` is refused rather than silently allowed.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
