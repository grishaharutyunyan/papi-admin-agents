import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { AuthResult } from '$/api/auth/dto/auth-result.dto';
import { isAuthResult } from '$/api/auth/dto/auth-result.dto';
import type { SsoLoginDto } from '$/api/sso/dto/sso-login.dto';
import { papiAuthorityConfig } from '$/configs/index.configs';
import type { OutboundContext } from '$/core/http/outbound-context';
import { forwardingHeaders } from '$/core/http/outbound-context';
import { postToPapiAuthority, throwForProxyError } from '$/core/http/papi-authority-caller';

const GENERIC_MESSAGE = 'Could not sign in with SSO. Please try again.';

/**
 * Proxies `POST /api/sso/login` to papi-authority, adding this fork's own
 * `PANEL_KEY` — never trusting a client-supplied one. Same two-class error
 * contract as `AuthService` (see there and `papi-init-back/CLAUDE.md`): a 4xx
 * from papi-authority (e.g. "SSO is disabled for this panel") is re-thrown
 * unchanged; anything else collapses to a static generic message.
 */
@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    @Inject(papiAuthorityConfig.KEY)
    private readonly config: ConfigType<typeof papiAuthorityConfig>,
  ) {}

  async login(dto: SsoLoginDto, context: OutboundContext): Promise<AuthResult> {
    try {
      const { body } = await postToPapiAuthority(this.config.baseUrl, {
        path: '/api/sso/login',
        body: { azureToken: dto.azureToken, panelKey: this.config.panelKey },
        headers: forwardingHeaders(context),
      });

      if (!isAuthResult(body)) {
        this.logger.error('/api/sso/login returned an unexpected response shape');
        throw new ServiceUnavailableException(GENERIC_MESSAGE);
      }

      return body;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throwForProxyError(error, this.logger, '/api/sso/login', GENERIC_MESSAGE);
    }
  }
}
