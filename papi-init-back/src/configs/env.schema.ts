import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

import { toBoolean, toStringArray } from '$/configs/env.transformers';
import { NodeEnv } from '$/constants/enums/config.enums';

/** Same shape papi-authority enforces on `admin_panels.panel_key` at creation. */
const PANEL_KEY_PATTERN = /^[A-Z0-9_]+$/;

/**
 * The single declaration of every environment variable this service accepts.
 *
 * Validation runs during module init — before `app.listen` — and reports every
 * error at once, so a misconfigured deployment dies loudly at boot instead of
 * failing on the first request that happens to touch the bad value. Mirrors
 * papi-authority's `env.schema.ts` pattern exactly (same platform convention).
 */
export class EnvironmentVariables {
  /* ------------------------------------------------------------------ core */

  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 7790;

  @IsString()
  @MinLength(1)
  APP_NAME: string = 'papi-init-back';

  /**
   * Number of trusted reverse-proxy hops. Set BEFORE anything IP-keyed reads a
   * client address — the throttler keys on it, and it is what makes
   * `req.ip` trustworthy for the `X-Forwarded-For` this service sets on its
   * own outbound calls to papi-authority (Part P.6). 0 = no proxy in front.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  TRUSTED_PROXY_HOPS: number = 0;

  /** Comma-separated exact origins. Never `*`. Required in staging/production. */
  @Transform(toStringArray)
  @IsString({ each: true })
  CORS_ORIGINS: string[] = [];

  /** Grace period between `/ready` flipping to 503 and `app.close()`. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120_000)
  READINESS_DRAIN_MS: number = 5_000;

  @IsString()
  @MinLength(2)
  BODY_LIMIT: string = '100kb';

  /* -------------------------------------------------- papi-authority link */

  /**
   * This fork's identity in papi-authority — must match a seeded
   * `admin_panels.panel_key` row there (Part P.7). Same format papi-authority
   * enforces when the row is created.
   */
  @IsString()
  @Matches(PANEL_KEY_PATTERN, { message: 'PANEL_KEY may contain only A-Z, 0-9 and underscore' })
  PANEL_KEY!: string;

  /**
   * Base URL of the papi-authority instance this service is a thin consumer
   * of. No trailing slash expected; the JWKS/app-init/auth-proxy paths are
   * appended by their own callers.
   */
  @IsUrl({ require_tld: false }, { message: 'PAPI_AUTHORITY_BASE_URL must be a valid URL' })
  PAPI_AUTHORITY_BASE_URL!: string;

  /* --------------------------------------------------------- token verify */

  /**
   * Expected `iss`/`aud` on every access token this service verifies locally
   * against papi-authority's JWKS (Phase 2). MUST match the values the actual
   * papi-authority instance signs with (its own `JWT_ISSUER`/`JWT_AUDIENCE`,
   * `src/configs/auth.config.ts` there) — these are NOT hardcoded defaults
   * here on purpose, since a real deployment may run several papi-authority
   * instances with different values.
   */
  @IsString()
  @MinLength(1)
  JWT_ISSUER!: string;

  @IsString()
  @MinLength(1)
  JWT_AUDIENCE!: string;

  /* -------------------------------------------------------------- throttle */

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  THROTTLE_DEFAULT_TTL: number = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_DEFAULT_LIMIT: number = 100;

  /** Applied per-route to login/refresh/SSO from Phase 3 — not a global bucket. */
  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  THROTTLE_AUTH_TTL: number = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT: number = 10;

  /* --------------------------------------------------------- storage (Phase 6) */

  /**
   * Gates `src/services/storage/` (Azure Blob upload/delete/exists — module
   * inventory Part R.3). When `false`, the module never even attempts to
   * build a `BlobServiceClient` (Part R.5).
   */
  @Transform(toBoolean)
  @IsBoolean()
  STORAGE_ENABLED: boolean = false;

  @ValidateIf((config: EnvironmentVariables) => config.STORAGE_ENABLED)
  @IsString()
  @MinLength(1, {
    message: 'AZURE_STORAGE_CONNECTION_STRING is required when STORAGE_ENABLED=true',
  })
  AZURE_STORAGE_CONNECTION_STRING: string = '';

  @ValidateIf((config: EnvironmentVariables) => config.STORAGE_ENABLED)
  @IsString()
  @Matches(/^[a-z0-9-]{3,63}$/, {
    message:
      'AZURE_STORAGE_CONTAINER_NAME must be 3-63 lowercase letters, digits or hyphens ' +
      '(required when STORAGE_ENABLED=true)',
  })
  AZURE_STORAGE_CONTAINER_NAME: string = '';

  /**
   * Enforced BEFORE the full upload buffer is ever read into memory (Part
   * R.5) — checked against a declared `Content-Length`/stream byte-counter,
   * not after an arbitrarily large upload has already been buffered.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(524_288_000)
  STORAGE_MAX_FILE_SIZE_BYTES: number = 10_485_760;

  /* ------------------------------------------------ image processing (Phase 6) */

  /**
   * Gates `src/services/image-processing/` (resize/WebP-convert via `sharp`).
   * Accepts only an in-memory `Buffer` — never a URL — closing the SSRF hole
   * in the old `SharpService.toBuffer` (Part R.5).
   */
  @Transform(toBoolean)
  @IsBoolean()
  IMAGE_PROCESSING_ENABLED: boolean = false;

  /* ------------------------------------------------------ clickhouse (Phase 6) */

  /**
   * Gates `src/services/clickhouse/`. Every query goes through
   * `@clickhouse/client`'s parameterized `query_params` — never a
   * string-built WHERE/HAVING clause (Part R.5's SQL-injection finding).
   */
  @Transform(toBoolean)
  @IsBoolean()
  CLICKHOUSE_ENABLED: boolean = false;

  @ValidateIf((config: EnvironmentVariables) => config.CLICKHOUSE_ENABLED)
  @IsUrl(
    { require_tld: false },
    { message: 'CLICKHOUSE_URL must be a valid URL (required when CLICKHOUSE_ENABLED=true)' },
  )
  CLICKHOUSE_URL: string = '';

  @ValidateIf((config: EnvironmentVariables) => config.CLICKHOUSE_ENABLED)
  @IsString()
  @MinLength(1, { message: 'CLICKHOUSE_USERNAME is required when CLICKHOUSE_ENABLED=true' })
  CLICKHOUSE_USERNAME: string = '';

  @ValidateIf((config: EnvironmentVariables) => config.CLICKHOUSE_ENABLED)
  @IsString()
  @MinLength(1, { message: 'CLICKHOUSE_PASSWORD is required when CLICKHOUSE_ENABLED=true' })
  CLICKHOUSE_PASSWORD: string = '';

  @ValidateIf((config: EnvironmentVariables) => config.CLICKHOUSE_ENABLED)
  @IsString()
  @MinLength(1, { message: 'CLICKHOUSE_DATABASE is required when CLICKHOUSE_ENABLED=true' })
  CLICKHOUSE_DATABASE: string = '';

  /* ----------------------------------------------------------- export (Phase 6) */

  /**
   * Gates `src/services/export/` — CSV (`fast-csv`) and Excel (`exceljs`,
   * never `xlsx` — Part R.5) export, with spreadsheet-formula neutralization
   * applied to every cell regardless of format.
   */
  @Transform(toBoolean)
  @IsBoolean()
  EXPORT_ENABLED: boolean = false;

  /* --------------------------------------------------- external system (Phase 6) */

  /**
   * Static API key for `ExternalSystemAuthGuard` — always required, NOT
   * gated by an `_ENABLED` flag: the guard is always-on infrastructure
   * (module inventory Part R.3), compared with `crypto.timingSafeEqual`,
   * never `!==` (Part R.5's timing side-channel finding).
   */
  @IsString()
  @MinLength(16, { message: 'EXTERNAL_SYSTEM_AUTH_API_KEY must be at least 16 characters' })
  EXTERNAL_SYSTEM_AUTH_API_KEY!: string;

  /* ------------------------------------------------------------ gRPC (Phase 9) */

  /**
   * A JSON array of `{enabled, host, protoPath, packageName, service}`
   * objects (Part R.3), generalized from old-papi's `GRPC_SERVICES_ARR` env
   * var / `IGrpcConnectionConfigs` shape — the ONLY old backend with an
   * actually-populated gRPC client was `cms-backend-main`
   * (`serviceNames: ['Casino']`); papi-back's and rmp-back's own
   * `grpc/index.ts` ship with an empty `serviceNames = []`. There is
   * deliberately NO `GRPC_ENABLED` flag: an empty/unset `GRPC_SERVICES`
   * (default `'[]'`) naturally means nothing can ever be registered — the
   * same "disabled means zero attempted connections" rule as every other
   * module in this service, expressed here as "nothing configured" rather
   * than a boolean gate, because gRPC is registered per-service-name by
   * whichever module needs a client, not globally in `app.module.ts`.
   * Validated as well-formed JSON with the correct per-entry shape in
   * {@link crossFieldErrors} below (a plain decorator cannot express "valid
   * JSON array of objects with these five typed fields").
   */
  @IsString()
  GRPC_SERVICES: string = '[]';
}

const PROD_LIKE: ReadonlySet<NodeEnv> = new Set([NodeEnv.Staging, NodeEnv.Production]);

/**
 * Rules that depend on more than one variable, expressed as explicit checks so
 * the failure message says what to do rather than which decorator tripped.
 */
function crossFieldErrors(config: EnvironmentVariables): string[] {
  const errors: string[] = [];
  const isProdLike = PROD_LIKE.has(config.NODE_ENV);

  if (isProdLike && config.CORS_ORIGINS.length === 0) {
    errors.push(
      `CORS_ORIGINS must list explicit origins when NODE_ENV=${config.NODE_ENV}. ` +
        'A wildcard or empty allow-list is not permitted.',
    );
  }

  if (isProdLike && config.PAPI_AUTHORITY_BASE_URL.startsWith('http://')) {
    errors.push(
      `PAPI_AUTHORITY_BASE_URL must use https when NODE_ENV=${config.NODE_ENV}. ` +
        'Plaintext calls to papi-authority carry credentials and tokens.',
    );
  }

  errors.push(...validateGrpcServices(config.GRPC_SERVICES));

  return errors;
}

const GRPC_SERVICE_STRING_FIELDS = ['host', 'protoPath', 'packageName', 'service'] as const;

/**
 * `class-validator` has no built-in "valid JSON array of typed objects"
 * check, so `GRPC_SERVICES` is validated here rather than via a decorator —
 * same reasoning/pattern as {@link validateExternalDbUrlMap}. Checked
 * unconditionally (there is no `GRPC_ENABLED` flag to gate this on): a
 * malformed value must fail fast at boot even if nothing ends up requesting
 * any of the configured services.
 */
function validateGrpcServices(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ['GRPC_SERVICES must be valid JSON.'];
  }

  if (!Array.isArray(parsed)) {
    return [
      'GRPC_SERVICES must be a JSON array of ' +
        '{"enabled": boolean, "host": string, "protoPath": string, "packageName": string, "service": string} objects.',
    ];
  }

  const errors: string[] = [];

  parsed.forEach((entry: unknown, index: number) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`GRPC_SERVICES[${index}] must be an object.`);
      return;
    }

    const record = entry as Record<string, unknown>;

    if (typeof record.enabled !== 'boolean') {
      errors.push(`GRPC_SERVICES[${index}].enabled must be a boolean.`);
    }

    for (const field of GRPC_SERVICE_STRING_FIELDS) {
      const value = record[field];
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`GRPC_SERVICES[${index}].${field} must be a non-empty string.`);
      }
    }
  });

  return errors;
}

/**
 * Passed to `ConfigModule.forRoot({ validate })`.
 *
 * We deliberately do NOT whitelist/forbid unknown properties: the incoming
 * object is the whole process environment, which legitimately contains
 * hundreds of unrelated variables (PATH, HOME, ...).
 */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const failures = validateSync(config, {
    skipMissingProperties: false,
    stopAtFirstError: false,
  });

  const messages = failures.flatMap((failure) =>
    Object.values(failure.constraints ?? {}).map((text) => `  - ${text}`),
  );

  messages.push(...crossFieldErrors(config).map((text) => `  - ${text}`));

  if (messages.length > 0) {
    throw new Error(
      `Invalid configuration — ${messages.length} problem(s) found:\n${messages.join('\n')}`,
    );
  }

  cached = config;
  return config;
}

let cached: EnvironmentVariables | undefined;

/**
 * The validated environment, memoized. Config factories read from this rather
 * than from `process.env`, so every value they expose has already passed
 * validation regardless of the order Nest happens to invoke them in.
 */
export function env(): EnvironmentVariables {
  cached ??= validateEnv(process.env);
  return cached;
}
