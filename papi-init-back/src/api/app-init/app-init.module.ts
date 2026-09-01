import { Module } from '@nestjs/common';

import { AppInitController } from '$/api/app-init/controllers/app-init.controller';
import { AppInitService } from '$/api/app-init/services/app-init.service';

@Module({
  controllers: [AppInitController],
  providers: [AppInitService],
})
export class AppInitModule {}
