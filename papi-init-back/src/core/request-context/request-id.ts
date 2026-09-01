import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * An inbound id is echoed into logs and error responses, so its length is
 * bounded — an unbounded client-supplied value is a log-injection and
 * storage-abuse vector. Copied from papi-authority's `request-id.ts`.
 */
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Reuse a well-formed inbound `x-request-id` so a correlation id survives the
 * front-end -> papi-init-back -> papi-authority hop chain; otherwise mint one.
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
 * This is deliberately NOT done through `ClsModule`'s `middleware.setup` hook
 * — papi-authority's Phase 1 verified that hook does not fire for these
 * routes. Mounting an explicit middleware first in `main.ts` guarantees the id
 * exists before any other middleware can fail, and pairing it with
 * `ClsModule`'s `idGenerator` (which reads this same normalized header) keeps
 * the CLS id and the response header identical.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = requestIdFrom(req);

  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);

  next();
}
