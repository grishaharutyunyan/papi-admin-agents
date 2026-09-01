import { Controller, Get, Query, Req, UnauthorizedException } from '@nestjs/common';

import { UserQueryDto } from '$/api/users/dto/user-query.dto';
import type { PaginatedUserView } from '$/api/users/dto/user-view.dto';
import { UsersService } from '$/api/users/services/users.service';
import { PlatformPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/**
 * `GET /api/users` — a read-only, list-only proxy to papi-authority's own
 * `UsersController.list`. Deliberately scoped to this one route: the rest of
 * papi-authority's `UsersController` surface (create/update/delete/access/
 * password/unauthorize) stays access-control's — papi-authority's own
 * controller comment says as much ("the surface access-control consumes").
 * Adding any of those here would need its own explicit approval; this is not
 * a scope this route grows into silently.
 *
 * Unlike `MeController`, this is NOT a self-resource — it's an admin listing
 * of other users — so it is gated with `@PlatformPermissions(['users', 'view'])`
 * rather than `@SkipPermissions()`. `PermissionGuard` (Phase 4) already
 * default-denies any route without a declared requirement, so this decorator
 * is load-bearing, not decorative.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @PlatformPermissions(['users', 'view'])
  findAll(
    @Query() query: UserQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaginatedUserView> {
    return this.users.findAll(query, authorizationOf(request));
  }
}

/**
 * `JwtGuard` (Phase 2) has already verified the header is present and
 * well-formed before any handler on this controller runs — this is
 * defensive only, but it is the line that makes "this proxy never runs
 * without a real caller token" true regardless of what upstream guards did,
 * so it fails closed rather than forwarding `undefined`. Duplicated from
 * `me.controller.ts` rather than shared, matching that file's own
 * per-controller placement of the same helper.
 */
function authorizationOf(request: AuthenticatedRequest): string {
  const header = request.headers.authorization;
  if (typeof header !== 'string') throw new UnauthorizedException();
  return header;
}
