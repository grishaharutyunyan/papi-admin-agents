import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthResult } from '$/api/auth/dto/auth-result.dto';
import { LoginDto, LogoutDto, RefreshDto } from '$/api/auth/dto/login.dto';
import type { SessionResponse } from '$/api/auth/dto/session-response.dto';
import { AuthService } from '$/api/auth/services/auth.service';
import { outboundContextOf } from '$/core/http/outbound-context';
import { AuthThrottle, Public, SkipPermissions } from '$/decorators/public.decorator';
import type { AuthenticatedRequest } from '$/guards/jwt.guard';

import type { Request } from 'express';

/**
 * `POST /api/auth/{login,refresh,logout}` — thin proxies to papi-authority
 * (tech plan Phase 3), each marked `@Public()` individually rather than at
 * the class level: they are unauthenticated by definition (they are how a
 * session begins, continues and ends), but `GET /api/auth/session` below is
 * NOT — it reads an already-verified token, so the class itself carries no
 * blanket `@Public()`.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthThrottle()
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthResult> {
    return this.authService.login(dto, outboundContextOf(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @AuthThrottle()
  refresh(@Body() dto: RefreshDto, @Req() request: Request): Promise<AuthResult> {
    return this.authService.refresh(dto, outboundContextOf(request));
  }

  /**
   * Always 204 — even if the upstream proxy call itself fails. See
   * `AuthService.logout` and `papi-init-back/CLAUDE.md`.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuthThrottle()
  async logout(@Body() dto: LogoutDto, @Req() request: Request): Promise<void> {
    await this.authService.logout(dto.refreshToken, outboundContextOf(request));
  }

  /**
   * `GET /api/auth/session` (tech plan Phase 5) — decodes this service's OWN
   * already-verified `request.tokenClaims` (Phase 2's `JwtGuard`) and returns
   * exactly `{projects, platform}`. **Zero calls to papi-authority** — this
   * is the whole point: the front-end asks "what can I do" once per render
   * cycle without re-deriving it from a decoded JWT itself, and without a
   * network round trip to get it. `@SkipPermissions()` because the resource
   * is "my own token" — nothing to authorize beyond being signed in, same
   * reasoning as every route on `MeController`.
   */
  @Get('session')
  @SkipPermissions()
  getSession(@Req() request: AuthenticatedRequest): SessionResponse {
    const claims = request.tokenClaims;
    if (!claims) throw new UnauthorizedException();

    return { projects: claims.projects, platform: claims.platform };
  }
}
