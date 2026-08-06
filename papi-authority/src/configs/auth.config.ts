import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';

export const authConfig = registerAs('auth', () => {
  const e = env();

  return {
    accessTokenTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: e.REFRESH_TOKEN_TTL_SECONDS,
    jwtIssuer: e.JWT_ISSUER,
    jwtAudience: e.JWT_AUDIENCE,
    onboardingMode: e.ONBOARDING_MODE,
    invitationOrigin: e.INVITATION_ORIGIN,
    invitationTtlHours: e.INVITATION_TTL_HOURS,
    lockout: {
      maxFailures: e.LOCKOUT_MAX_FAILURES,
      windowMinutes: e.LOCKOUT_WINDOW_MINUTES,
      durationMinutes: e.LOCKOUT_DURATION_MINUTES,
    },
  };
});
