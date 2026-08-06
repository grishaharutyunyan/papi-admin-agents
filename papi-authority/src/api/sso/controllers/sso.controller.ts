import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';

import { IsString, Length, MaxLength } from 'class-validator';

import { SsoService } from '$/api/sso/services/sso.service';
import { AuthThrottle, Public } from '$/decorators/public.decorator';

import type { Request } from 'express';

export class SsoLoginDto {
  @IsString()
  @MaxLength(8192)
  azureToken!: string;

  @IsString()
  @Length(1, 100)
  panelKey!: string;
}

/**
 * Centralized Azure SSO (dossier B.6). The forks stop doing their own Azure
 * verification — one place to secure, consistent with one authority.
 */
@Public()
@Controller('sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthThrottle()
  login(@Body() dto: SsoLoginDto, @Req() request: Request) {
    const userAgent = request.headers['user-agent'];

    return this.sso.login(dto.azureToken, dto.panelKey, {
      ip: request.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
    });
  }
}
