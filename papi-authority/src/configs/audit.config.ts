import { registerAs } from '@nestjs/config';

import { env } from '$/configs/env.schema';

/**
 * Audit + geo-IP enrichment (dossier B.15, 0.53).
 *
 * Local MaxMind `.mmdb` files only — no provider URL, no API key. The audit
 * trail exists to protect exactly the data a remote lookup would export.
 */
export const auditConfig = registerAs('audit', () => {
  const e = env();

  return {
    geoIpEnabled: e.GEOIP_ENABLED,
    geoIpCityDb: e.GEOIP_CITY_DB,
    geoIpAsnDb: e.GEOIP_ASN_DB,
  };
});
