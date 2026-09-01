import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { AuthResult } from '$/api/auth/dto/auth-result.dto';
import { isAuthResult } from '$/api/auth/dto/auth-result.dto';
import type { LoginDto, RefreshDto } from '$/api/auth/dto/login.dto';
import { papiAuthorityConfig } from '$/configs/index.configs';
import type { OutboundContext } from '$/core/http/outbound-context';
import { forwardingHeaders } from '$/core/http/outbound-context';
import { postToPapiAuthority, throwForProxyError } from '$/core/http/papi-authority-caller';

/**
 * Proxies `POST /api/auth/{login,refresh,logout}` to papi-authority, adding
 * this fork's own `PANEL_KEY` and the caller's real IP/User-Agent — never
 * trusting a client-supplied panel key (tech plan Phase 3 deliverable 1,
 * dossier 0.35).
 *
 * Error handling follows the two-class contract documented on
 * `postToPapiAuthority` and restated in `papi-init-back/CLAUDE.md`:
 * papi-authority's own 4xx messages are safe-by-design and are re-thrown
 * unchanged (same status, same message) so `AllExceptionsFilter`'s
 * 4xx-passthrough rule takes over; anything else collapses to one static,
 * generic message per endpoint.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(papiAuthorityConfig.KEY)
    private readonly config: ConfigType<typeof papiAuthorityConfig>,
  ) {}

  async login(dto: LoginDto, context: OutboundContext): Promise<AuthResult> {
    return this.proxy(
      '/api/auth/login',
      { username: dto.username, password: dto.password, panelKey: this.config.panelKey },
      forwardingHeaders(context),
      'Could not sign in. Please try again.',
    );
  }

  async refresh(dto: RefreshDto, context: OutboundContext): Promise<AuthResult> {
    return this.proxy(
      '/api/auth/refresh',
      { refreshToken: dto.refreshToken },
      {
        ...forwardingHeaders(context),
        // NOT a body field here — papi-authority reads the panel key for
        // refresh from this header (`x-admin-panel-key`), unlike login/sso
        // where it's a body field. See papi-init-back/CLAUDE.md.
        'x-admin-panel-key': this.config.panelKey,
      },
      'Could not refresh the session. Please sign in again.',
    );
  }

  /**
   * Always resolves — never throws, even if the proxy call to papi-authority
   * itself fails. papi-authority's own logout is designed to always return
   * 204 (it never reveals whether a token was recognized, to prevent
   * probing); this mirrors that intent at this layer too, so a client-side
   * logout never surfaces a 5xx and never leaves the front-end unsure
   * whether to clear its local token.
   */
  async logout(refreshToken: string, context: OutboundContext): Promise<void> {
    try {
      await postToPapiAuthority(this.config.baseUrl, {
        path: '/api/auth/logout',
        body: { refreshToken },
        headers: forwardingHeaders(context),
      });
    } catch (error) {
      this.logger.error(
        `logout proxy call failed (still returning 204): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async proxy(
    path: string,
    body: unknown,
    headers: Record<string, string>,
    genericMessage: string,
  ): Promise<AuthResult> {
    try {
      const { body: responseBody } = await postToPapiAuthority(this.config.baseUrl, {
        path,
        body,
        headers,
      });

      if (!isAuthResult(responseBody)) {
        this.logger.error(`${path} returned an unexpected response shape`);
        throw new ServiceUnavailableException(genericMessage);
      }

      return responseBody;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throwForProxyError(error, this.logger, path, genericMessage);
    }
  }
}
