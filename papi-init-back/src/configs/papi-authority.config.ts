import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';

/**
 * The two facts that make this service papi-authority's consumer rather than
 * its own identity provider (Part P.4/P.7): which panel it is, and where the
 * authority lives. Every outbound call this service ever makes to
 * papi-authority is built from these two values.
 */
export const papiAuthorityConfig = registerAs('papiAuthority', () => {
  const e = env();

  return {
    panelKey: e.PANEL_KEY,
    baseUrl: e.PAPI_AUTHORITY_BASE_URL,
  };
});
