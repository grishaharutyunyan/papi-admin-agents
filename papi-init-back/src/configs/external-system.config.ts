import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';

/**
 * `ExternalSystemAuthGuard` — always-on service-to-service API-key surface,
 * NOT gated by an `_ENABLED` flag (module inventory Part R.3).
 */
export const externalSystemConfig = registerAs('externalSystem', () => {
  const e = env();

  return {
    apiKey: e.EXTERNAL_SYSTEM_AUTH_API_KEY,
  };
});
