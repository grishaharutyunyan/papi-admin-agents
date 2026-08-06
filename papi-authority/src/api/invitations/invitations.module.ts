import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import { AuditModule } from '$/api/audit/audit.module';
import { InvitationApprovalController } from '$/api/invitations/controllers/invitation-approval.controller';
import { InvitationController } from '$/api/invitations/controllers/invitation.controller';
import { InvitationEntity } from '$/api/invitations/entities/invitation.entity';
import { InvitationApprovalService } from '$/api/invitations/services/invitation-approval.service';
import { InvitationService } from '$/api/invitations/services/invitation.service';
import { ProjectEntity } from '$/api/projects/entities/project.entity';
import { SsoConfigModule } from '$/api/sso/sso-config.module';
import { UserEntity } from '$/api/users/entities/user.entity';
import { DataSourceName } from '$/constants/enums/config.enums';

/**
 * Two principals, one domain.
 *
 * - Invite / validate / accept (`InvitationService`) run on the **authority**
 *   connection: invitations are auth-runtime, and none of those steps creates
 *   an identity (dossier 0.8).
 * - Approval (`InvitationApprovalService`) runs on the **console** connection,
 *   the only principal that may create a `users` row. It is one transaction —
 *   user + grants + audit + delete of the invitation (0.24, 0.44).
 *
 * **Controller order is load-bearing.** `InvitationApprovalController` declares
 * `GET invitations/pending`, while `InvitationController` declares the public
 * `GET invitations/:token`. Registered the other way round, `/pending` would
 * match `:token` and return a 404 from the token-validation path instead of the
 * pending list — a silent wrong answer, not an error.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [InvitationEntity, ProjectEntity, AdminPanelEntity],
      DataSourceName.Authority,
    ),
    TypeOrmModule.forFeature(
      [InvitationEntity, UserEntity, ProjectEntity, AdminPanelEntity],
      DataSourceName.Console,
    ),
    AuditModule,
    SsoConfigModule,
  ],
  controllers: [InvitationApprovalController, InvitationController],
  providers: [InvitationService, InvitationApprovalService],
  exports: [InvitationService],
})
export class InvitationsModule {}
