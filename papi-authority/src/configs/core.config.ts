import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';
import { NodeEnv } from '$/constants/enums/config.enums';

export const coreConfig = registerAs('core', () => {
  const e = env();

  return {
    appName: e.APP_NAME,
    port: e.PORT,
    nodeEnv: e.NODE_ENV,
    isLocal: e.NODE_ENV === NodeEnv.Local,
    isProduction: e.NODE_ENV === NodeEnv.Production,
    isProdLike: e.NODE_ENV === NodeEnv.Production || e.NODE_ENV === NodeEnv.Staging,
    trustedProxyHops: e.TRUSTED_PROXY_HOPS,
    corsOrigins: e.CORS_ORIGINS,
    readinessDrainMs: e.READINESS_DRAIN_MS,
    bodyLimit: e.BODY_LIMIT,
  };
});
