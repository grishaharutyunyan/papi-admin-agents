import { Global, Module } from '@nestjs/common';

import { GeoIpService } from '$/core/geoip/geoip.service';

/**
 * Global because `AuditService` is the only consumer today but every future
 * audit writer needs it, and the readers hold memory-mapped file handles that
 * must be opened exactly once per process — not once per importing module.
 */
@Global()
@Module({
  providers: [GeoIpService],
  exports: [GeoIpService],
})
export class GeoIpModule {}
