import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { AuditService } from '$/api/audit/services/audit.service';
// AuthService must be a VALUE import: a type-only import erases the runtime
// metadata Nest needs to resolve the dependency.
import { AuthService } from '$/api/auth/services/auth.service';
import type { AuthResult, RequestContext } from '$/api/auth/services/auth.service';
import { InvitationService } from '$/api/invitations/services/invitation.service';
import {
  AzureTokenVerifierService,
  AzureVerificationError,
} from '$/api/sso/services/azure-token-verifier.service';
import { PanelSsoConfigService } from '$/api/sso/services/panel-sso-config.service';
import { UserEntity } from '$/api/users/entities/user.entity';
import { authConfig } from '$/configs/index.configs';
import { DataSourceName, OnboardingMode } from '$/constants/enums/config.enums';
import { AuthEventOutcome, AuthEventType } from '$/constants/enums/domain.enums';

@Injectable()
export class SsoService {
  constructor(
    @InjectRepository(UserEntity, DataSourceName.Authority)
    private readonly users: Repository<UserEntity>,
    private readonly ssoConfig: PanelSsoConfigService,
    private readonly azureVerifier: AzureTokenVerifierService,
    private readonly invitations: InvitationService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  /**
   * Azure SSO login (dossier 0.9 / Part J).
   *
   * The Azure token proves WHO someone is; it conveys no authorization. What
   * they may do comes solely from papi-authority's model, so a perfectly valid
   * token for an unknown or unapproved person yields nothing.
   */
  async login(azureToken: string, panelKey: string, context: RequestContext): Promise<AuthResult> {
    const { panel, tenantId, clientId } = await this.ssoConfig.resolve(panelKey);

    let identity;
    try {
      identity = await this.azureVerifier.verify(azureToken, tenantId, clientId);
    } catch (error) {
      // A bad Azure token is a credential failure, not a server fault. Left
      // unmapped it surfaces as 500, which is both wrong and noise in error
      // monitoring. The reason is never reported back.
      if (error instanceof AzureVerificationError) {
        await this.audit.record({
          eventType: AuthEventType.SsoLoginRejected,
          outcome: AuthEventOutcome.Failure,
          adminPanelId: panel.id,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: { reason: 'azure_verification_failed' },
        });
        throw new UnauthorizedException('Invalid credentials.');
      }
      throw error;
    }

    // Match on `oid`, not email: `oid` is immutable, whereas an email can be
    // reassigned to a different person in the directory.
    const user = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.projects', 'project')
      .leftJoinAndSelect('user.adminPanels', 'adminPanel')
      .where('user.oid = :oid', { oid: identity.oid })
      .andWhere('user.is_active = TRUE')
      .getOne();

    if (!user) {
      await this.onboardUnknown(identity, panel.id, context);
      throw new UnauthorizedException('This account is not yet approved for access.');
    }

    if (!user.adminPanels.some((granted) => granted.id === panel.id)) {
      await this.audit.record({
        eventType: AuthEventType.SsoLoginRejected,
        outcome: AuthEventOutcome.Denied,
        actorUserId: user.id,
        adminPanelId: panel.id,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: 'no_panel_grant' },
      });
      throw new UnauthorizedException('This account is not yet approved for access.');
    }

    const result = await this.authService.issueForSso(user, panel.panelKey, context);

    await this.audit.record({
      eventType: AuthEventType.SsoLoginSucceeded,
      outcome: AuthEventOutcome.Success,
      actorUserId: user.id,
      adminPanelId: panel.id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return result;
  }

  /**
   * An authenticated Azure user we have no identity for.
   *
   * `invite_only` (the default): rejected, and **nothing is created** — the
   * identity store can never fill with un-vetted directory members.
   * `open_sso`: an ACCEPTED INVITATION is created pending admin approval —
   * still never a `users` row (dossier 0.8/B.10).
   */
  private async onboardUnknown(
    identity: {
      oid: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      tenantId: string;
    },
    adminPanelId: string,
    context: RequestContext,
  ): Promise<void> {
    if (this.config.onboardingMode === OnboardingMode.InviteOnly) {
      await this.audit.record({
        eventType: AuthEventType.SsoLoginRejected,
        outcome: AuthEventOutcome.Denied,
        adminPanelId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { reason: 'uninvited', mode: 'invite_only', oid: identity.oid, created: false },
      });
      return;
    }

    // open_sso — but only once; a repeat login must not pile up invitations.
    const existing = await this.invitations.findAcceptedByOid(identity.oid);
    if (!existing) await this.invitations.createAcceptedFromSso(identity);

    await this.audit.record({
      eventType: AuthEventType.SsoLoginRejected,
      outcome: AuthEventOutcome.Denied,
      adminPanelId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { reason: 'awaiting_approval', mode: 'open_sso', oid: identity.oid },
    });
  }
}
