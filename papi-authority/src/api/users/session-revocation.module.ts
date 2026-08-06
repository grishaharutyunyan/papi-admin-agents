import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RefreshTokenEntity } from '$/api/auth/entities/refresh-token.entity';
import { UserEntity } from '$/api/users/entities/user.entity';
import { SessionRevocationService } from '$/api/users/services/session-revocation.service';
import { DataSourceName } from '$/constants/enums/config.enums';

/**
 * `SessionRevocationService` alone, in its own module.
 *
 * It exists separately to break a dependency cycle: `UsersModule` needs
 * `AuthModule` (for `RefreshTokenService` on the self-service password path),
 * `AuthModule` needs `AuthorizationModule` (to resolve permissions into a
 * token), and `AuthorizationModule` needs session revocation (an entitlement
 * change must cut live sessions). Importing `UsersModule` from
 * `AuthorizationModule` would close that loop.
 *
 * The service depends on nothing but two console-bound repositories, so
 * hoisting it out is the natural cut rather than a workaround —
 * `forwardRef` would paper over the cycle instead of removing it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RefreshTokenEntity, UserEntity], DataSourceName.Console)],
  providers: [SessionRevocationService],
  exports: [SessionRevocationService],
})
export class SessionRevocationModule {}
