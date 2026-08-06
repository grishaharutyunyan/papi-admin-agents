import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * An inbound id is echoed into logs and (from Phase 8) audit rows, so its
 * length is bounded — an unbounded client-supplied value is a log-injection and
 * storage-abuse vector.
 */
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Reuse a well-formed inbound `x-request-id` so a correlation id survives the
 * fork -> papi-authority hop; otherwise mint one.
 */
export function requestIdFrom(req: Request): string {
  const header: unknown = req.headers[REQUEST_ID_HEADER];

  if (typeof header === 'string') {
    const trimmed = header.trim();
    if (trimmed.length > 0 && trimmed.length <= MAX_REQUEST_ID_LENGTH) {
      return trimmed;
    }
  }

  return randomUUID();
}

/**
 * Assigns the correlation id and echoes it on the response.
 *
 * This is deliberately NOT done through `ClsModule`'s `middleware.setup` hook:
 * that hook was verified not to run for these routes (a static test value never
 * reached the response), and correlation is too important to leave to a library
 * lifecycle detail. Mounting it first in `main.ts` also guarantees the id exists
 * before any other middleware can fail.
 *
 * The normalized header is what `ClsModule`'s `idGenerator` subsequently reads,
 * so the CLS id and the response header are always the same value.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = requestIdFrom(req);

  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);

  next();
}
