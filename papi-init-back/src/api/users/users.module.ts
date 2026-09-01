import { Module } from '@nestjs/common';

import { MeController } from '$/api/users/controllers/me.controller';
import { UsersController } from '$/api/users/controllers/users.controller';
import { MeService } from '$/api/users/services/me.service';
import { UsersService } from '$/api/users/services/users.service';

@Module({
  controllers: [MeController, UsersController],
  providers: [MeService, UsersService],
})
export class UsersModule {}
