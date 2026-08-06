import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';

/**
 * Two named buckets. papi-back ships a single global 100/60s IP-keyed bucket,
 * which is far too loose for credential endpoints (dossier D.3b) — the `auth`
 * bucket is applied per-route to login/refresh/SSO/invitation in Phases 4 and 6.
 */
export const throttleConfig = registerAs('throttle', () => {
  const e = env();

  return {
    default: { ttl: e.THROTTLE_DEFAULT_TTL, limit: e.THROTTLE_DEFAULT_LIMIT },
    auth: { ttl: e.THROTTLE_AUTH_TTL, limit: e.THROTTLE_AUTH_LIMIT },
  };
});
