import { Module } from '@nestjs/common';

import { ExternalSystemController } from '$/api/external-system/controllers/external-system.controller';
import { ExternalSystemAuthGuard } from '$/guards/external-system-auth.guard';

@Module({
  controllers: [ExternalSystemController],
  providers: [ExternalSystemAuthGuard],
})
export class ExternalSystemModule {}
