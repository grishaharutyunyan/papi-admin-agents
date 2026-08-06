import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '$/api/audit/audit.module';
import { AuthModule } from '$/api/auth/auth.module';
import { InvitationsModule } from '$/api/invitations/invitations.module';
import { SsoController } from '$/api/sso/controllers/sso.controller';
import { SsoService } from '$/api/sso/services/sso.service';
import { SsoConfigModule } from '$/api/sso/sso-config.module';
import { UserEntity } from '$/api/users/entities/user.entity';
import { DataSourceName } from '$/constants/enums/config.enums';

/**
 * Centralized Azure SSO (dossier B.6 / 0.9). Depends on InvitationsModule for
 * `open_sso` onboarding, which is why config + verification live in the
 * separate SsoConfigModule — invitation acceptance needs them without pulling
 * this module in and creating a cycle.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity], DataSourceName.Authority),
    SsoConfigModule,
    InvitationsModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [SsoController],
  providers: [SsoService],
})
export class SsoModule {}
