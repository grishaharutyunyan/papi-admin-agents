import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
  ValidateIf,
} from 'class-validator';

import { toBoolean, toStringArray } from '$/configs/env.transformers';
import { KeySource, NodeEnv, OnboardingMode } from '$/constants/enums/config.enums';

const MYSQL_URI = /^mysql:\/\/.+/;

/**
 * The single declaration of every environment variable this service accepts.
 *
 * Validation runs during module init — before `app.listen` — and reports every
 * error at once, so a misconfigured deployment dies loudly at boot instead of
 * failing on the first request that happens to touch the bad value.
 */
export class EnvironmentVariables {
  /* ------------------------------------------------------------------ core */

  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 7780;

  @IsString()
  @MinLength(1)
  APP_NAME: string = 'papi-authority';

  /**
   * Number of trusted reverse-proxy hops. Set BEFORE anything IP-keyed reads a
   * client address. papi-back omits this entirely and trusts `x-forwarded-for`
   * blindly, which makes throttle buckets and audit IPs client-spoofable
   * (dossier D.3b). 0 means "no proxy — use the socket address".
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  TRUSTED_PROXY_HOPS: number = 0;

  /** Comma-separated exact origins. Never `*`. Required outside local/test. */
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

  /* -------------------------------------------------------------- database */

  @IsString()
  @Matches(MYSQL_URI, { message: 'DB_AUTHORITY_URI must be a mysql:// connection URI' })
  DB_AUTHORITY_URI!: string;

  @IsString()
  @Matches(MYSQL_URI, { message: 'DB_CONSOLE_URI must be a mysql:// connection URI' })
  DB_CONSOLE_URI!: string;

  /**
   * DDL-only principal, used exclusively by the migration CLI (dossier N4).
   * Optional at runtime: the service itself must never hold DDL, and in
   * production the DB team applies schema changes (dossier 0.26).
   */
  @IsOptional()
  @IsString()
  @Matches(MYSQL_URI, { message: 'DB_MIGRATOR_URI must be a mysql:// connection URI' })
  DB_MIGRATOR_URI?: string;

  @Transform(toBoolean)
  @IsBoolean()
  DB_SSL: boolean = false;

  @Transform(toBoolean)
  @IsBoolean()
  DB_LOGGING: boolean = false;

  /* ------------------------------------------------------------------ auth */

  /**
   * The revocation ceiling. With no Redis (dossier B.8), this TTL is how long a
   * revoked user can still act. Capped at 15 minutes deliberately.
   */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(900)
  ACCESS_TOKEN_TTL_SECONDS: number = 300;

  @Type(() => Number)
  @IsInt()
  @Min(300)
  REFRESH_TOKEN_TTL_SECONDS: number = 604_800;

  @IsString()
  @MinLength(1)
  JWT_ISSUER!: string;

  @IsString()
  @MinLength(1)
  JWT_AUDIENCE!: string;

  @IsEnum(OnboardingMode)
  ONBOARDING_MODE: OnboardingMode = OnboardingMode.InviteOnly;

  /**
   * Origin of the standalone invitation/join page. It lives on its own
   * subdomain and is therefore cross-origin to this API (dossier 0.19), so it
   * must be an explicit CORS allow-list entry.
   */
  @IsOptional()
  @IsString()
  INVITATION_ORIGIN?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  INVITATION_TTL_HOURS: number = 72;

  /* --------------------------------------------------------------- lockout */

  /** papi-back's proven values (10 failures / 15 min -> 30 min lock), now configurable. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  LOCKOUT_MAX_FAILURES: number = 10;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  LOCKOUT_WINDOW_MINUTES: number = 15;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  LOCKOUT_DURATION_MINUTES: number = 30;

  /* ---------------------------------------------------------------- crypto */

  @IsEnum(KeySource)
  KEY_SOURCE: KeySource = KeySource.DevLocal;

  @ValidateIf((o: EnvironmentVariables) => o.KEY_SOURCE === KeySource.AzureKeyVault)
  @IsString()
  @MinLength(1, { message: 'AZURE_KEYVAULT_URI is required when KEY_SOURCE=azure_key_vault' })
  AZURE_KEYVAULT_URI?: string;

  @ValidateIf((o: EnvironmentVariables) => o.KEY_SOURCE === KeySource.AzureKeyVault)
  @IsString()
  @MinLength(1, { message: 'AZURE_KEYVAULT_KEY_NAME is required when KEY_SOURCE=azure_key_vault' })
  AZURE_KEYVAULT_KEY_NAME?: string;

  @IsOptional()
  @IsString()
  DEV_LOCAL_KEY_PATH?: string;

  /* ------------------------------------------------------------------ mail */

  @Transform(toBoolean)
  @IsBoolean()
  MAIL_ENABLED: boolean = false;

  @ValidateIf((o: EnvironmentVariables) => o.MAIL_ENABLED)
  @IsString()
  @MinLength(1, { message: 'ACS_CONNECTION_STRING is required when MAIL_ENABLED is true' })
  ACS_CONNECTION_STRING?: string;

  @ValidateIf((o: EnvironmentVariables) => o.MAIL_ENABLED)
  @IsString()
  @MinLength(1, { message: 'ACS_SENDER_ADDRESS is required when MAIL_ENABLED is true' })
  ACS_SENDER_ADDRESS?: string;

  /* ----------------------------------------------------------------- audit */

  @Transform(toBoolean)
  @IsBoolean()
  GEOIP_ENABLED: boolean = false;

  /**
   * Paths to LOCAL MaxMind databases (dossier 0.53). There is deliberately no
   * provider URL and no API key: enrichment must never put a third-party
   * network call on the authentication path, nor disclose an administrator's
   * IP — including a failed-login IP — to an outside service.
   *
   * The city database is required when enrichment is on; ASN is optional,
   * since country/city is the useful part and the ASN file is a separate
   * download.
   */
  @ValidateIf((o: EnvironmentVariables) => o.GEOIP_ENABLED)
  @IsString()
  @MinLength(1, { message: 'GEOIP_CITY_DB is required when GEOIP_ENABLED is true' })
  GEOIP_CITY_DB?: string;

  @IsOptional()
  @IsString()
  GEOIP_ASN_DB?: string;

  /* -------------------------------------------------------------- throttle */

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  THROTTLE_DEFAULT_TTL: number = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_DEFAULT_LIMIT: number = 100;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  THROTTLE_AUTH_TTL: number = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT: number = 10;
}

const PROD_LIKE: ReadonlySet<NodeEnv> = new Set([NodeEnv.Staging, NodeEnv.Production]);

/**
 * Rules that depend on more than one variable, expressed as explicit checks so
 * the failure message says what to do rather than which decorator tripped.
 */
function crossFieldErrors(config: EnvironmentVariables): string[] {
  const errors: string[] = [];
  const isProdLike = PROD_LIKE.has(config.NODE_ENV);

  if (isProdLike && config.KEY_SOURCE !== KeySource.AzureKeyVault) {
    errors.push(
      `KEY_SOURCE must be "${KeySource.AzureKeyVault}" when NODE_ENV=${config.NODE_ENV}. ` +
        'The local dev key is forbidden outside non-production environments (dossier B.4).',
    );
  }

  if (isProdLike && config.CORS_ORIGINS.length === 0) {
    errors.push(
      `CORS_ORIGINS must list explicit origins when NODE_ENV=${config.NODE_ENV}. ` +
        'A wildcard or empty allow-list is not permitted.',
    );
  }

  if (isProdLike && !config.MAIL_ENABLED) {
    errors.push(
      `MAIL_ENABLED must be true when NODE_ENV=${config.NODE_ENV}. ` +
        'With mail disabled, invitations would be created and never delivered — and the ' +
        'dev-only token exposure of dossier 0.42 exists precisely because that combination ' +
        'is only ever valid in local/test.',
    );
  }

  if (isProdLike && !config.DB_SSL) {
    errors.push(`DB_SSL must be enabled when NODE_ENV=${config.NODE_ENV}.`);
  }

  if (config.REFRESH_TOKEN_TTL_SECONDS <= config.ACCESS_TOKEN_TTL_SECONDS) {
    errors.push('REFRESH_TOKEN_TTL_SECONDS must be greater than ACCESS_TOKEN_TTL_SECONDS.');
  }

  return errors;
}

/**
 * Passed to `ConfigModule.forRoot({ validate })`.
 *
 * Note we deliberately do NOT whitelist/forbid unknown properties: the incoming
 * object is the whole process environment, which legitimately contains hundreds
 * of unrelated variables (PATH, HOME, ...).
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
