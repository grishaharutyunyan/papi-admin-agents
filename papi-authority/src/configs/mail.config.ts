import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';

/** Azure Communication Services (dossier B.13). Placeholder until Phase 6. */
export const mailConfig = registerAs('mail', () => {
  const e = env();

  return {
    enabled: e.MAIL_ENABLED,
    acsConnectionString: e.ACS_CONNECTION_STRING,
    acsSenderAddress: e.ACS_SENDER_ADDRESS,
  };
});
