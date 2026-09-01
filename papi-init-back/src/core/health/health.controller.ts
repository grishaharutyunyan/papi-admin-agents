import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { ShutdownService } from '$/core/shutdown/shutdown.service';
import { Public } from '$/decorators/public.decorator';

/**
 * The ONLY owner of `/live` and `/ready`.
 *
 * papi-back registers both paths in two different controllers — whichever
 * module resolves first wins — and its `/ready` variant returns HTTP 200 with
 * `statusCode: 503` in the body while shutting down, which no load balancer
 * acts on (dossier D.3b). Here `/ready` returns a real 503.
 *
 * This service has no database (Part P.5), so there is nothing to probe
 * beyond the shutdown flag — but the pattern (no diagnostic detail in the
 * response body, one owner, a real status code) is kept exactly as
 * papi-authority's, for whatever a forked panel adds a dependency check for
 * later.
 */
@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly shutdown: ShutdownService) {}

  /** Liveness: the process is up. Never checks dependencies. */
  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness: safe to route traffic here. */
  @Get('ready')
  ready(): { status: string } {
    if (this.shutdown.isShuttingDown) {
      throw new ServiceUnavailableException({ status: 'shutting_down' });
    }

    return { status: 'ready' };
  }
}
