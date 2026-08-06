import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClsModule } from 'nestjs-cls';

import { ApiModule } from '$/api/api.module';
import { validateEnv } from '$/configs/env.schema';
import { configurations, databaseConfig, throttleConfig } from '$/configs/index.configs';
import { DataSourceName } from '$/constants/enums/config.enums';
import { CryptoModule } from '$/core/crypto/crypto.module';
import { GeoIpModule } from '$/core/geoip/geoip.module';
import { HealthModule } from '$/core/health/health.module';
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
     * Two connections, two least-privilege DB principals (dossier B.3, Part G).
     * `authority` runs the auth engine; `console` is the only connection that
     * may create or edit identities. Identity entities are mapped on BOTH from
     * Phase 2 — the DB grant, not the mapping, is what makes them read-only for
     * the authority principal.
     */
    TypeOrmModule.forRootAsync({
      name: DataSourceName.Authority,
      inject: [databaseConfig.KEY],
      useFactory: (config: ConfigType<typeof databaseConfig>) => config[DataSourceName.Authority],
    }),

    TypeOrmModule.forRootAsync({
      name: DataSourceName.Console,
      inject: [databaseConfig.KEY],
      useFactory: (config: ConfigType<typeof databaseConfig>) => config[DataSourceName.Console],
    }),

    /**
     * Only the `default` bucket is registered globally. The tighter `auth`
     * bucket is deliberately NOT global — every named throttler in this array
     * applies to every route, so registering a 10/min bucket here would
     * throttle the whole API to 10 requests a minute. It is applied per-route
     * to login/refresh/SSO/invitation in Phases 4 and 6.
     */
    ThrottlerModule.forRootAsync({
      inject: [throttleConfig.KEY],
      useFactory: (config: ConfigType<typeof throttleConfig>) => ({
        throttlers: [
          { name: 'default', ttl: config.default.ttl, limit: config.default.limit },
          // Tight bucket for credential endpoints. It is registered globally
          // but every non-auth route opts out via `skipIf`, so only routes
          // carrying `@Throttle({ auth: {} })` are actually limited by it.
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
    CryptoModule,
    // Global: opens its memory-mapped databases once per process, not once
    // per importing module (dossier 0.53).
    GeoIpModule,
    HealthModule,
    ApiModule,
  ],
  providers: [
    /**
     * Guard order is significant and matches papi-back's proven ordering:
     * throttle before authenticate before authorize. JwtGuard and
     * PermissionGuard join in Phases 4 and 5.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
