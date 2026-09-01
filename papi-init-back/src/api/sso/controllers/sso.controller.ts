import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';

import type { AuthResult } from '$/api/auth/dto/auth-result.dto';
import { SsoLoginDto } from '$/api/sso/dto/sso-login.dto';
import { SsoService } from '$/api/sso/services/sso.service';
import { outboundContextOf } from '$/core/http/outbound-context';
import { AuthThrottle, Public } from '$/decorators/public.decorator';

import type { Request } from 'express';

/** `POST /api/sso/login` — thin proxy to papi-authority's centralized Azure SSO. */
@Public()
@Controller('sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthThrottle()
  login(@Body() dto: SsoLoginDto, @Req() request: Request): Promise<AuthResult> {
    return this.sso.login(dto, outboundContextOf(request));
  }
}
