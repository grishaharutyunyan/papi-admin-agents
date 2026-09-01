import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { UserQueryDto } from '$/api/users/dto/user-query.dto';
import type { PaginatedUserView } from '$/api/users/dto/user-view.dto';
import { isPaginatedUserView } from '$/api/users/dto/user-view.dto';
import { papiAuthorityConfig } from '$/configs/index.configs';
import type { PapiAuthoritySuccess } from '$/core/http/papi-authority-caller';
import { getFromPapiAuthority, throwForProxyError } from '$/core/http/papi-authority-caller';

/**
 * Proxies `GET /api/users` (list only) to papi-authority's own
 * `UsersController.list`. Deliberately the ONLY route of that controller
 * mirrored here — create/update/delete/access/password/unauthorize stay
 * access-control's surface (papi-authority's own `UsersController` comment:
 * "the surface access-control consumes"). This service holds no `users`
 * table; it forwards the caller's own `Authorization` header unchanged and
 * validates the response shape before returning it — same `proxy()`-helper
 * shape as `MeService`.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(papiAuthorityConfig.KEY)
    private readonly config: ConfigType<typeof papiAuthorityConfig>,
  ) {}

  async findAll(query: UserQueryDto, authorization: string): Promise<PaginatedUserView> {
    const path = '/api/users';
    const qs = buildQueryString(query);
    const fullPath = qs.size > 0 ? `${path}?${qs.toString()}` : path;

    return this.proxy(
      () =>
        getFromPapiAuthority(this.config.baseUrl, {
          path: fullPath,
          headers: { Authorization: authorization },
        }),
      isPaginatedUserView,
      path,
      'Could not load users. Please try again.',
    );
  }

  /**
   * Same shape as `MeService.proxy` (and `AuthService.proxy`/`SsoService.login`)
   * — kept identical across every proxy service in this codebase on purpose.
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

/**
 * Only forwards fields the caller actually set — an omitted `roleId`/`isActive`
 * must not become the literal string `"undefined"` in papi-authority's own
 * querystring.
 */
function buildQueryString(query: UserQueryDto): URLSearchParams {
  const params = new URLSearchParams();

  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.search !== undefined) params.set('search', query.search);
  if (query.order !== undefined) params.set('order', query.order);
  if (query.roleId !== undefined) params.set('roleId', query.roleId);
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));

  return params;
}
