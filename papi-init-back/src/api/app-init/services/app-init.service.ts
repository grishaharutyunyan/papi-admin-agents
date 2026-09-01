import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { AppInitResponse } from '$/api/app-init/dto/app-init.dto';
import { isAppInitResponse } from '$/api/app-init/dto/app-init.dto';
import { papiAuthorityConfig } from '$/configs/index.configs';

/** Hard ceiling so an unreachable papi-authority cannot hang this call forever. */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Proxies papi-authority's `GET /api/app-init?panelKey=<PANEL_KEY>` (dossier
 * 0.61). This is the one and only outbound HTTP call this service makes in
 * Phase 1 — a shared `src/core/http-client/` wrapper is Phase 6's job, not
 * this one's; a single `fetch` call does not earn its own abstraction yet.
 *
 * On ANY failure — network error, timeout, non-2xx, or an unexpected response
 * shape — this throws a single generic `ServiceUnavailableException`. The
 * caller (an unauthenticated login page) must never learn WHICH upstream call
 * failed or why; the real detail is logged here and, independently, collapsed
 * to a generic message by the global `AllExceptionsFilter` (503 is a 5xx, so
 * it always collapses regardless of the message given here).
 */
@Injectable()
export class AppInitService {
  private readonly logger = new Logger(AppInitService.name);

  constructor(
    @Inject(papiAuthorityConfig.KEY)
    private readonly config: ConfigType<typeof papiAuthorityConfig>,
  ) {}

  async getConfig(): Promise<AppInitResponse> {
    const url = new URL('/api/app-init', this.config.baseUrl);
    url.searchParams.set('panelKey', this.config.panelKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        this.logger.error(
          `app-init upstream call failed: status=${response.status} url=${url.pathname}`,
        );
        throw new ServiceUnavailableException('The service is temporarily unavailable.');
      }

      const body: unknown = await response.json();

      if (!isAppInitResponse(body)) {
        this.logger.error('app-init upstream call returned an unexpected response shape');
        throw new ServiceUnavailableException('The service is temporarily unavailable.');
      }

      return body;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;

      // Network error, DNS failure, or the abort from the timeout above.
      this.logger.error(
        `app-init upstream call threw: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException('The service is temporarily unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
