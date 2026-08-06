import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';

import { LoginDto, LogoutDto, RefreshDto } from '$/api/auth/dto/login.dto';
import { AuthService } from '$/api/auth/services/auth.service';
import type { RequestContext } from '$/api/auth/services/auth.service';
import { AuthThrottle, Public } from '$/decorators/public.decorator';

import type { Request } from 'express';

/**
 * All three routes are unauthenticated by definition — they are how a session
 * begins, continues and ends.
 *
 * They carry the tight `auth` throttle rather than the global default: these
 * are the endpoints an attacker actually hammers. papi-back applies one global
 * 100/60s bucket to everything, which is far too loose for credentials
 * (dossier D.3b).
 */
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthThrottle()
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, contextOf(request));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @AuthThrottle()
  refresh(@Body() dto: RefreshDto, @Req() request: Request) {
    const panelKey =
      typeof request.headers['x-admin-panel-key'] === 'string'
        ? request.headers['x-admin-panel-key']
        : '';

    return this.authService.refresh(dto.refreshToken, panelKey, contextOf(request));
  }

  /**
   * Always 204, whether or not the token was recognised. Reporting "unknown
   * token" would let a caller probe which refresh tokens exist.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuthThrottle()
  async logout(@Body() dto: LogoutDto, @Req() request: Request): Promise<void> {
    await this.authService.logout(dto.refreshToken, contextOf(request));
  }
}

/**
 * `request.ip` is only trustworthy because `trust proxy` is configured
 * explicitly at bootstrap; papi-back reads `x-forwarded-for` directly, which an
 * attacker controls (dossier D.3b).
 */
function contextOf(request: Request): RequestContext {
  const userAgent = request.headers['user-agent'];

  return {
    ip: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
  };
}
