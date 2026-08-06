import { auditConfig } from '$/configs/audit.config';
import { authConfig } from '$/configs/auth.config';
import { coreConfig } from '$/configs/core.config';
import { cryptoConfig } from '$/configs/crypto.config';
import { databaseConfig } from '$/configs/database.config';
import { mailConfig } from '$/configs/mail.config';
import { throttleConfig } from '$/configs/throttle.config';

/**
 * Every namespace is registered with `registerAs`, so consumers inject
 * `ConfigType<typeof xConfig>` and get real types — no `configService.get<T>()`
 * casts, which papi-back is forced into because its config is an untyped POJO
 * (dossier 0.14 / D.3b).
 */
export const configurations = [
  coreConfig,
  databaseConfig,
  authConfig,
  cryptoConfig,
  mailConfig,
  auditConfig,
  throttleConfig,
];

export {
  auditConfig,
  authConfig,
  coreConfig,
  cryptoConfig,
  databaseConfig,
  mailConfig,
  throttleConfig,
};
