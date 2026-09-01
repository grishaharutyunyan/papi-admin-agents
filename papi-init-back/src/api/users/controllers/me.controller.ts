import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import { ChangeMyPasswordDto } from '$/api/users/dto/change-my-password.dto';
import type { MeProjectView } from '$/api/users/dto/me-project-view.dto';
import type { MeView } from '$/api/users/dto/me-view.dto';
import { UpdateMeDto } from '$/api/users/dto/update-me.dto';
import { MeService } from '$/api/users/services/me.service';
import { AuthThrottle, SkipPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/**
 * `GET/PATCH /api/users/me`, `POST /api/users/me/password`,
 * `GET /api/users/me/projects` — thin proxies to papi-authority's own
 * `MeController` (tech plan Phase 5). `@SkipPermissions()` on every route
 * here is deliberate and matches papi-authority's own reasoning: the
 * resource IS the caller (taken from the verified token, never a path
 * param), so there is nothing to authorize beyond "you are signed in." This
 * service's own `JwtGuard`/`PermissionGuard` (Phases 2/4) already ran before
 * any of these handlers execute — a request with no/invalid `Authorization`
 * header never reaches papi-authority at all.
 */
@Controller('users/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @SkipPermissions()
  findMe(@Req() request: AuthenticatedRequest): Promise<MeView> {
    return this.me.findMe(authorizationOf(request));
  }

  @Patch()
  @SkipPermissions()
  updateMe(@Body() dto: UpdateMeDto, @Req() request: AuthenticatedRequest): Promise<MeView> {
    return this.me.updateMe(dto, authorizationOf(request));
  }

  /**
   * Throttled with the tight `auth` bucket: it accepts and verifies a
   * password, making it a credential endpoint regardless of being
   * authenticated — same reasoning papi-authority's own `MeController`
   * applies to this exact route.
   */
  @Post('password')
  @SkipPermissions()
  @AuthThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeMyPassword(
    @Body() dto: ChangeMyPasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.me.changeMyPassword(dto, authorizationOf(request));
  }

  @Get('projects')
  @SkipPermissions()
  findMyProjects(@Req() request: AuthenticatedRequest): Promise<MeProjectView[]> {
    return this.me.findMyProjects(authorizationOf(request));
  }
}

/**
 * `JwtGuard` (Phase 2) has already verified the header is present and
 * well-formed before any handler on this controller runs — this is
 * defensive only, but it is the line that makes "this proxy never runs
 * without a real caller token" true regardless of what upstream guards did,
 * so it fails closed rather than forwarding `undefined`.
 */
function authorizationOf(request: AuthenticatedRequest): string {
  const header = request.headers.authorization;
  if (typeof header !== 'string') throw new UnauthorizedException();
  return header;
}
