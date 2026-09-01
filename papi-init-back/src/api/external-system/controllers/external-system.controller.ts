import { Controller, Get, UseGuards } from '@nestjs/common';

import { Public } from '$/decorators/public.decorator';
import { ExternalSystemAuthGuard } from '$/guards/external-system-auth.guard';

/**
 * Trivial demonstration route for `ExternalSystemAuthGuard` — no real
 * business logic exists yet (module inventory Part R.3: this is
 * infrastructure ready for a future fork's internal caller, not a shipped
 * feature). `@Public()` exempts it from the global `JwtGuard`/`PermissionGuard`
 * pair (this is service-to-service auth, not end-user auth); the route-level
 * `ExternalSystemAuthGuard` is the actual gate.
 */
@Controller('external-system')
export class ExternalSystemController {
  @Public()
  @UseGuards(ExternalSystemAuthGuard)
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}
