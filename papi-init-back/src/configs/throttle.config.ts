import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';

/**
 * Two named buckets, same shape as papi-authority's. `default` is registered
 * globally; the tighter `auth` bucket exists now so Phase 3's login/refresh/
 * SSO proxy routes can opt in with `@AuthThrottle()` without a config change.
 */
export const throttleConfig = registerAs('throttle', () => {
  const e = env();

  return {
    default: { ttl: e.THROTTLE_DEFAULT_TTL, limit: e.THROTTLE_DEFAULT_LIMIT },
    auth: { ttl: e.THROTTLE_AUTH_TTL, limit: e.THROTTLE_AUTH_LIMIT },
  };
});
