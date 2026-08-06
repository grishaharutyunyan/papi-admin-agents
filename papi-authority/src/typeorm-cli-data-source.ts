import 'reflect-metadata';

import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';

import { ALL_ENTITIES } from '$/core/orm/entities';

/**
 * Data source used ONLY by the TypeORM CLI (`npm run migration:*`).
 *
 * Two things make this file different from the runtime connections:
 *
 * 1. It connects as `papi_migrator` — the DDL-only principal (dossier N4).
 *    Neither `papi_authority` nor `papi_console` holds ALTER/DROP, so neither
 *    can reshape the schema. In production the DB team applies DDL from the
 *    handover package and this file is not used at all (dossier 0.26).
 *
 * 2. It runs against COMPILED output (`dist/`), which is why the npm scripts
 *    build first. `tsconfig-paths` requires `baseUrl`, which we deliberately
 *    removed (dossier 0.16), so a ts-node path would not resolve `$/` imports.
 *    The Nest CLI already strips every alias at emit, so the compiled
 *    data-source needs no alias resolution — and this avoids papi-back's
 *    `src/*.ts`-for-CLI vs `dist/*.js`-for-runtime asymmetry.
 */
loadDotenv();

const url = process.env.DB_MIGRATOR_URI;

if (!url) {
  throw new Error(
    'DB_MIGRATOR_URI must be set to run TypeORM CLI commands. It is the DDL-only ' +
      'principal and is intentionally separate from DB_AUTHORITY_URI / DB_CONSOLE_URI.',
  );
}

export default new DataSource({
  type: 'mysql',
  url,
  entities: ALL_ENTITIES,
  migrations: ['dist/migrations/*.js'],
  migrationsRun: false,
  synchronize: false,
  ...(process.env.DB_SSL === '1' || process.env.DB_SSL === 'true'
    ? { ssl: { rejectUnauthorized: true } }
    : {}),
});
