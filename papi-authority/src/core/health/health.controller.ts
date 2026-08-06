import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

import { DataSourceName } from '$/constants/enums/config.enums';
import { ShutdownService } from '$/core/shutdown/shutdown.service';
import { Public } from '$/decorators/public.decorator';

/**
 * The ONLY owner of `/live` and `/ready`.
 *
 * papi-back registers both paths in two different controllers — whichever
 * module resolves first wins — and its `AppController` variant returns HTTP 200
 * with `statusCode: 503` in the body while shutting down, which no load
 * balancer will act on (dossier D.3b). Here `/ready` returns a real 503.
 *
 * Responses carry no diagnostic detail: papi-back's `/ready` leaks raw database
 * error text to anonymous callers.
 */
@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly shutdown: ShutdownService,
    @InjectDataSource(DataSourceName.Authority)
    private readonly authorityDataSource: DataSource,
    @InjectDataSource(DataSourceName.Console)
    private readonly consoleDataSource: DataSource,
  ) {}

  /** Liveness: the process is up. Never checks dependencies. */
  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness: safe to route traffic here. */
  @Get('ready')
  async ready(): Promise<{ status: string }> {
    if (this.shutdown.isShuttingDown) {
      throw new ServiceUnavailableException({ status: 'shutting_down' });
    }

    const probes = await Promise.allSettled([
      this.authorityDataSource.query('SELECT 1'),
      this.consoleDataSource.query('SELECT 1'),
    ]);

    if (probes.some((probe) => probe.status === 'rejected')) {
      // Deliberately opaque — the caller is unauthenticated.
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }

    return { status: 'ready' };
  }
}
