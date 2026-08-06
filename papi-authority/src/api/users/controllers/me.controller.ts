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

import type { RequestContext } from '$/api/auth/services/auth.service';
import { ChangeMyPasswordDto, UpdateMeDto } from '$/api/users/dto/me.dto';
import { MeService } from '$/api/users/services/me.service';
import { AuthThrottle, SkipPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

/**
 * Self-service (dossier 0.45). This is what rmp and the other panels call when
 * a user edits their own profile or password — the panels never write identity
 * tables themselves.
 *
 * `@SkipPermissions` is correct here and is the only justified use of it on a
 * write route: the resource IS the caller. There is no permission to check
 * because there is nothing to authorize beyond "you are signed in" — the target
 * is taken from the verified token's `sub`, never from a path parameter, so a
 * caller cannot address anyone but themselves.
 *
 * Note the route prefix: `users/me` must be registered BEFORE the `users/:id`
 * routes, which `UsersModule` does. `:id` carries a `ParseUUIDPipe`, so a
 * mis-ordered registration would 400 rather than silently mis-route — a loud
 * failure, but a failure all the same.
 */
@Controller('users/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @SkipPermissions()
  findMe(@Req() request: AuthenticatedRequest) {
    return this.me.findMe(subjectOf(request));
  }

  @Patch()
  @SkipPermissions()
  updateMe(@Body() dto: UpdateMeDto, @Req() request: AuthenticatedRequest) {
    return this.me.updateMe(subjectOf(request), dto, contextOf(request));
  }

  /**
   * Throttled with the tight `auth` bucket: it accepts a password and verifies
   * one, which makes it a credential endpoint regardless of being authenticated.
   */
  @Post('password')
  @SkipPermissions()
  @AuthThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeMyPassword(
    @Body() dto: ChangeMyPasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.me.changeMyPassword(subjectOf(request), dto, contextOf(request), dto.refreshToken);
  }
}

/**
 * The subject comes from the verified token and nowhere else. `JwtGuard` has
 * already run, so this is defensive only — but it is the line that makes the
 * "you can only act on yourself" property true, so it fails closed.
 */
function subjectOf(request: AuthenticatedRequest): string {
  const sub = request.tokenClaims?.sub;
  if (!sub) throw new UnauthorizedException();
  return sub;
}

function contextOf(request: AuthenticatedRequest): RequestContext {
  const userAgent = request.headers['user-agent'];

  return {
    ip: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
  };
}
