import { Module } from '@nestjs/common';

import { HttpClientService } from '$/core/http-client/http-client.service';

/** Always-on infra, not gated — every future fork's own outbound HTTP calls can inject `HttpClientService`. */
@Module({
  providers: [HttpClientService],
  exports: [HttpClientService],
})
export class HttpClientModule {}
