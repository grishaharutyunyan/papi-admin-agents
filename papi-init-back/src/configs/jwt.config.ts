import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';

/**
 * Expected `iss`/`aud` for every access token verified locally against
 * papi-authority's JWKS (Phase 2, `src/core/jwks/`). Kept as its own namespace
 * — separate from `papiAuthorityConfig` — because it is policy this service
 * enforces on the token, not a fact about where papi-authority lives.
 */
export const jwtConfig = registerAs('jwt', () => {
  const e = env();

  return {
    issuer: e.JWT_ISSUER,
    audience: e.JWT_AUDIENCE,
  };
});
