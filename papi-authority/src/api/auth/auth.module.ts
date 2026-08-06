import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuditModule } from '$/api/audit/audit.module';
import { AuthController } from '$/api/auth/controllers/auth.controller';
import { LoginLockoutEntity } from '$/api/auth/entities/login-lockout.entity';
import { RefreshTokenEntity } from '$/api/auth/entities/refresh-token.entity';
import { AuthService } from '$/api/auth/services/auth.service';
import { LockoutService } from '$/api/auth/services/lockout.service';
import { RefreshTokenService } from '$/api/auth/services/refresh-token.service';
import { AuthorizationModule } from '$/api/authorization/authorization.module';
import { UserEntity } from '$/api/users/entities/user.entity';
import { DataSourceName } from '$/constants/enums/config.enums';
import { CryptoModule } from '$/core/crypto/crypto.module';

/**
 * Every repository here is bound to the AUTHORITY connection. That principal
 * can read identity and write auth-runtime, but holds no INSERT/DELETE on
 * `users` and cannot touch `is_active`, `oid` or any grant column — so nothing
 * in this module can escalate a privilege even if it tried (dossier 0.23).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [UserEntity, AdminPanelEntity, RefreshTokenEntity, LoginLockoutEntity],
      DataSourceName.Authority,
    ),
    CryptoModule,
    AuditModule,
    AuthorizationModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenService, LockoutService],
  exports: [AuthService, RefreshTokenService],
})
export class AuthModule {}
