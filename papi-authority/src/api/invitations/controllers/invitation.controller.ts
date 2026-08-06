import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import { AcceptInvitationDto, CreateInvitationDto } from '$/api/invitations/dto/invitation.dto';
import { InvitationService } from '$/api/invitations/services/invitation.service';
import {
  AzureTokenVerifierService,
  AzureVerificationError,
} from '$/api/sso/services/azure-token-verifier.service';
import { PanelSsoConfigService } from '$/api/sso/services/panel-sso-config.service';
import { AuthThrottle, PlatformPermissions, Public } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

@Controller('invitations')
export class InvitationController {
  constructor(
    private readonly invitations: InvitationService,
    private readonly ssoConfig: PanelSsoConfigService,
    private readonly azureVerifier: AzureTokenVerifierService,
  ) {}

  /**
   * Admin-only. PLATFORM-scoped (dossier 0.43) — inviting someone belongs to no
   * tenant, so there is no `x-project-id` and the check reads the `platform`
   * claim.
   */
  @Post()
  @PlatformPermissions(['users', 'invite'])
  create(@Body() dto: CreateInvitationDto, @Req() request: AuthenticatedRequest) {
    return this.invitations.create(dto, request.tokenClaims?.sub ?? null);
  }

  /**
   * Called by the join page before showing the form. Public by necessity — the
   * invitee has no account yet — and throttled, since the token is the only
   * secret protecting it.
   */
  @Public()
  @AuthThrottle()
  @Get(':token')
  validate(@Param('token') token: string) {
    return this.invitations.validate(token);
  }

  /**
   * Azure-join acceptance. Marks the invitation `accepted` with the proven
   * `oid`; creates NO `users` row (dossier 0.8/0.24 — that is approval's job,
   * and only the console may do it).
   */
  @Public()
  @AuthThrottle()
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  async accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    const { tenantId, clientId } = await this.ssoConfig.resolve(dto.panelKey);

    let identity;
    try {
      identity = await this.azureVerifier.verify(dto.azureToken, tenantId, clientId);
    } catch (error) {
      // 401, not 500 — a bad Azure token is a credential failure.
      if (error instanceof AzureVerificationError) throw new UnauthorizedException();
      throw error;
    }

    return this.invitations.accept(token, identity);
  }
}
