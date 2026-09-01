import { coreConfig } from '$/configs/core.config';
import { externalSystemConfig } from '$/configs/external-system.config';
import { jwtConfig } from '$/configs/jwt.config';
import { papiAuthorityConfig } from '$/configs/papi-authority.config';
import { throttleConfig } from '$/configs/throttle.config';

/**
 * Every namespace is registered with `registerAs`, so consumers inject
 * `ConfigType<typeof xConfig>` and get real types — no `configService.get<T>()`
 * casts (same rule as papi-authority, dossier 0.14).
 */
export const configurations = [
  coreConfig,
  throttleConfig,
  papiAuthorityConfig,
  jwtConfig,
  externalSystemConfig,
];

export { coreConfig, externalSystemConfig, jwtConfig, papiAuthorityConfig, throttleConfig };
