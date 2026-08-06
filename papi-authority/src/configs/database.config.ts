import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';
import { DataSourceName } from '$/constants/enums/config.enums';
import { ALL_ENTITIES } from '$/core/orm/entities';

import type { DataSourceOptions } from 'typeorm';

/**
 * Shared tuning for every connection.
 *
 * `synchronize` is hard-coded `false` and is NOT env-driven by design: schema
 * is owned by migrations in every environment, and in production by the DB team
 * (dossier 0.26). There is no configuration under which this service may alter
 * a schema implicitly.
 */
const SHARED = {
  type: 'mysql' as const,
  synchronize: false,
  migrationsRun: false,
  // Not `as const` on the whole object: TypeORM's `MixedList` is a mutable
  // array type, so a readonly tuple would not be assignable.
  migrations: ['dist/migrations/*.js'],
  maxQueryExecutionTime: 5_000,
  extra: {
    connectionLimit: 20,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30_000,
  },
};

/**
 * NOTE: `name` is deliberately absent. TypeORM 1.0 removed it from
 * `DataSourceOptions` (it belonged to the pre-1.0 multi-connection API) — the
 * connection name is now supplied to `TypeOrmModule.forRootAsync({ name })`.
 */
function build(url: string): DataSourceOptions {
  const e = env();

  return {
    ...SHARED,
    url,
    // Identity entities are mapped on BOTH connections; the DB grant — not the
    // mapping — is what makes them read-only for the authority principal
    // (dossier Part G, Q5A).
    entities: ALL_ENTITIES,
    logging: e.DB_LOGGING,
    ...(e.DB_SSL ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

export const databaseConfig = registerAs('database', () => {
  const e = env();

  return {
    [DataSourceName.Authority]: build(e.DB_AUTHORITY_URI),
    [DataSourceName.Console]: build(e.DB_CONSOLE_URI),
  };
});
