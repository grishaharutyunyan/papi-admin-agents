import { Controller, Get } from '@nestjs/common';

import type { AppInitResponse } from '$/api/app-init/dto/app-init.dto';
import { AppInitService } from '$/api/app-init/services/app-init.service';
import { Public } from '$/decorators/public.decorator';

/**
 * `GET /api/app-init` — the panel's own login-page config, proxied from
 * papi-authority (dossier 0.61). Public by necessity: it answers "should the
 * login page show a password field, an SSO button, or both" before anyone has
 * signed in.
 *
 * Uses the global `default` throttle bucket, not `@AuthThrottle()` — this is
 * a read-only config probe fired on every page load, not a credential
 * verification attempt, so it must not share the tight per-IP `auth` bucket
 * with login/refresh/password-change (code review, 2026-08-31; same fix as
 * papi-authority's own app-init route, dossier 0.65).
 */
@Public()
@Controller('app-init')
export class AppInitController {
  constructor(private readonly appInit: AppInitService) {}

  @Get()
  getConfig(): Promise<AppInitResponse> {
    return this.appInit.getConfig();
  }
}
