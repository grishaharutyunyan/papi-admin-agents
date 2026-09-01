import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { ChangeMyPasswordDto } from '$/api/users/dto/change-my-password.dto';
import type { MeProjectView } from '$/api/users/dto/me-project-view.dto';
import { isMeProjectViewArray } from '$/api/users/dto/me-project-view.dto';
import type { MeView } from '$/api/users/dto/me-view.dto';
import { isMeView } from '$/api/users/dto/me-view.dto';
import type { UpdateMeDto } from '$/api/users/dto/update-me.dto';
import { papiAuthorityConfig } from '$/configs/index.configs';
import type { PapiAuthoritySuccess } from '$/core/http/papi-authority-caller';
import {
  getFromPapiAuthority,
  patchToPapiAuthority,
  postToPapiAuthority,
  throwForProxyError,
} from '$/core/http/papi-authority-caller';

/**
 * Proxies `GET/PATCH /api/users/me`, `POST /api/users/me/password` and
 * `GET /api/users/me/projects` to papi-authority's own `MeController` (tech
 * plan Phase 5). This service never touches identity data itself (Part
 * P.4/P.5) — the panel's own backend has no `users` table and never will.
 *
 * Unlike Phase 3's auth/sso proxies, every call here forwards the CALLER'S
 * OWN `Authorization` header unchanged: papi-authority's `MeController` is
 * self-service, not `@Public()` — there is no session to obtain here, there
 * already IS one. A 401 papi-authority itself returns (e.g. a token that
 * expired between this service's own `JwtGuard` check and the outbound call,
 * or papi-authority's own token-epoch/soft-delete check) is a trusted 4xx and
 * is forwarded unchanged, same two-class contract as every other proxy in
 * this service (see `papi-authority-caller.ts`).
 */
@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    @Inject(papiAuthorityConfig.KEY)
    private readonly config: ConfigType<typeof papiAuthorityConfig>,
  ) {}

  async findMe(authorization: string): Promise<MeView> {
    return this.proxy(
      () =>
        getFromPapiAuthority(this.config.baseUrl, {
          path: '/api/users/me',
          headers: { Authorization: authorization },
        }),
      isMeView,
      '/api/users/me',
      'Could not load your profile. Please try again.',
    );
  }

  async updateMe(dto: UpdateMeDto, authorization: string): Promise<MeView> {
    return this.proxy(
      () =>
        patchToPapiAuthority(this.config.baseUrl, {
          path: '/api/users/me',
          body: dto,
          headers: { Authorization: authorization },
        }),
      isMeView,
      '/api/users/me',
      'Could not update your profile. Please try again.',
    );
  }

  async findMyProjects(authorization: string): Promise<MeProjectView[]> {
    return this.proxy(
      () =>
        getFromPapiAuthority(this.config.baseUrl, {
          path: '/api/users/me/projects',
          headers: { Authorization: authorization },
        }),
      isMeProjectViewArray,
      '/api/users/me/projects',
      'Could not load your projects. Please try again.',
    );
  }

  /**
   * Always a 204 on success — there is no body to validate. Throttled with
   * the tight `auth` bucket at the controller: it accepts and verifies a
   * password, making it a credential endpoint regardless of being
   * authenticated (same reasoning papi-authority's own `MeController`
   * documents for this exact route).
   */
  async changeMyPassword(dto: ChangeMyPasswordDto, authorization: string): Promise<void> {
    const path = '/api/users/me/password';
    const genericMessage = 'Could not change your password. Please try again.';

    try {
      await postToPapiAuthority(this.config.baseUrl, {
        path,
        body: dto,
        headers: { Authorization: authorization },
      });
    } catch (error) {
      throwForProxyError(error, this.logger, path, genericMessage);
    }
  }

  /**
   * Shared shape for the three body-returning proxies: call papi-authority,
   * validate the response shape, and apply the two-class error contract.
   * Same pattern as `AuthService.proxy`/`SsoService.login` — kept identical
   * across every proxy service in this codebase on purpose.
   */
  private async proxy<T>(
    call: () => Promise<PapiAuthoritySuccess>,
    isValid: (value: unknown) => value is T,
    path: string,
    genericMessage: string,
  ): Promise<T> {
    try {
      const { body } = await call();

      if (!isValid(body)) {
        this.logger.error(`${path} returned an unexpected response shape`);
        throw new ServiceUnavailableException(genericMessage);
      }

      return body;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throwForProxyError(error, this.logger, path, genericMessage);
    }
  }
}
