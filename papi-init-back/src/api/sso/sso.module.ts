import { Module } from '@nestjs/common';

import { SsoController } from '$/api/sso/controllers/sso.controller';
import { SsoService } from '$/api/sso/services/sso.service';

@Module({
  controllers: [SsoController],
  providers: [SsoService],
})
export class SsoModule {}
