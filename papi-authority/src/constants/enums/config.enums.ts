export enum NodeEnv {
  Local = 'local',
  Test = 'test',
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
}

/** Dossier decision B.10 — invite-only is the default posture. */
export enum OnboardingMode {
  InviteOnly = 'invite_only',
  OpenSso = 'open_sso',
}

/**
 * Where the RS256 private key comes from. `dev_local` is non-production only —
 * boot MUST fail if production is configured with it (dossier B.4 / Part H.2).
 */
export enum KeySource {
  AzureKeyVault = 'azure_key_vault',
  DevLocal = 'dev_local',
}

/**
 * The two runtime TypeORM connections, backed by two least-privilege DB users
 * (dossier B.3, Part G). `authority` runs the auth engine; `console` is the
 * only connection that may create or edit identities.
 *
 * The third principal, `papi_migrator`, holds DDL and is used exclusively by
 * the migration CLI — never by the running service (dossier 0.26).
 */
export enum DataSourceName {
  Authority = 'authority',
  Console = 'console',
}
