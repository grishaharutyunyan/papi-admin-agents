import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';

/**
 * Tracks whether the process is draining, so `/ready` can fail before the
 * server actually stops accepting connections.
 *
 * papi-back has the same flag but calls `app.close()` immediately after setting
 * it, so nothing ever observes the 503 — draining is advertised and never
 * happens (dossier D.3b). The real grace window lives in `main.ts`.
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
