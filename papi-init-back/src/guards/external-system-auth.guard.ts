import { timingSafeEqual } from 'node:crypto';

import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { externalSystemConfig } from '$/configs/index.configs';

import type { Request } from 'express';

/** Header convention carried forward from old papi-back's `external-system-auth.guard.ts`. */
const API_KEY_HEADER = 'apikey';

/**
 * Service-to-service API-key guard, always on (module inventory Part R.3),
 * replacing old papi-back's `ExternalSystemAuthGuard`.
 *
 * ## The timing side-channel this fixes (Part R.5)
 *
 * The old guard compared the header to the configured key with plain
 * `apiKey !== validApiKey` — a byte-by-byte string comparison that returns as
 * soon as the first differing character is found, letting an attacker
 * recover the key one byte at a time by measuring response latency across
 * many attempts. **Fix:** compare with `crypto.timingSafeEqual` on
 * fixed-length buffers.
 *
 * A length check runs FIRST, and rejects immediately on a mismatch —
 * `timingSafeEqual` itself throws (rather than returning `false`) when given
 * two differently-sized buffers, so this check is required for correctness,
 * not merely an optimization. It does not reintroduce the timing leak: it
 * only ever reveals whether the supplied key is the RIGHT LENGTH, never
 * anything about its content, and an attacker who already knows the expected
 * key's length (a public fact about this deployment's configuration, not a
 * secret) learns nothing new from it.
 */
@Injectable()
export class ExternalSystemAuthGuard implements CanActivate {
  constructor(
    @Inject(externalSystemConfig.KEY)
    private readonly config: ConfigType<typeof externalSystemConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[API_KEY_HEADER];

    if (typeof provided !== 'string' || !this.isValidKey(provided)) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private isValidKey(provided: string): boolean {
    const expected = Buffer.from(this.config.apiKey, 'utf8');
    const supplied = Buffer.from(provided, 'utf8');

    if (supplied.length !== expected.length) return false;

    return timingSafeEqual(supplied, expected);
  }
}
