import { Module } from '@nestjs/common';

import { AuthController } from '$/api/auth/controllers/auth.controller';
import { AuthService } from '$/api/auth/services/auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
