import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';

/**
 * Tracks whether the process is draining, so `/ready` can fail before the
 * server actually stops accepting connections. Copied from papi-authority's
 * `shutdown.service.ts` — the real grace window lives in `main.ts`, which
 * flips this flag first and only calls `app.close()` after the drain window.
 */
@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private shuttingDown = false;

  markShuttingDown(): void {
    this.shuttingDown = true;
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  onApplicationShutdown(): void {
    this.shuttingDown = true;
  }
}
