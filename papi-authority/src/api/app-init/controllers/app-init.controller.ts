import { Controller, Get, Query } from '@nestjs/common';

import { AppInitQueryDto } from '$/api/app-init/dto/app-init.dto';
import type { AppInitView } from '$/api/app-init/dto/app-init.dto';
import { AppInitService } from '$/api/app-init/services/app-init.service';
import { Public } from '$/decorators/public.decorator';

/**
 * `GET /api/app-init?panelKey=<PANEL_KEY>` (dossier 0.61).
 *
 * Public by necessity: it answers "should the login page show a password
 * field, an SSO button, or both" — a question that has to be answered before
 * anyone can authenticate. Every fork's old login page called an equivalent
 * endpoint first; this is the one papi-authority-backed replacement all of
 * them proxy to.
 *
 * Uses the global `default` throttle bucket, not `@AuthThrottle()` — this is
 * a read-only config probe fired on every page load, not a credential
 * verification attempt, so it must not share the tight per-IP `auth` bucket
 * with login/refresh/password-change (code review, 2026-08-31).
 */
@Public()
@Controller('app-init')
export class AppInitController {
  constructor(private readonly appInit: AppInitService) {}

  @Get()
  resolve(@Query() query: AppInitQueryDto): Promise<AppInitView> {
    return this.appInit.resolve(query.panelKey);
  }
}
