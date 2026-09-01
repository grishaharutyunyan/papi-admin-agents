import { Global, Module } from '@nestjs/common';

import { ShutdownService } from '$/core/shutdown/shutdown.service';

@Global()
@Module({
  providers: [ShutdownService],
  exports: [ShutdownService],
})
export class ShutdownModule {}
