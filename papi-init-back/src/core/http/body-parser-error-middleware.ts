import type { NextFunction, Request, Response } from 'express';

/**
 * Neutralizes the one leak Phase 7's live capstone check found that its
 * static audit did not (2026-08-31): a malformed JSON request body makes
 * `json()`'s body-parser throw a raw `SyntaxError` whose message echoes a
 * snippet of the caller's own raw request — e.g. a mistyped login/password
 * payload. NestJS's own HTTP adapter wraps that raw error into a real
 * `BadRequestException`, carrying the leaked text as its message, BEFORE
 * `AllExceptionsFilter` ever runs — and does not preserve the original
 * `SyntaxError` as `.cause` (verified: `exception.cause` is `undefined` by
 * the time the filter sees it). The filter's "trusted 4xx" rule then
 * forwards that message to the client, unable to tell it apart from a
 * deliberately-authored one, because Nest's wrapping already discarded that
 * information.
 *
 * Verified empirically: `JSON.parse('hunter2longenoughtobeechoed is not
 * json')` throws `Unexpected token 'h', "hunter2lon"... is not valid JSON`.
 *
 * This middleware — mounted directly after `json()`/`urlencoded()` in
 * `main.ts` — is the ONLY point where the original `SyntaxError` is still
 * distinguishable. It neutralizes the message here, while deliberately
 * preserving `status`/`statusCode` (which Nest's own wrapping reads to
 * decide the response is a 400, not a 500) — the client-visible outcome is
 * otherwise unchanged: still a 400, still the same trusted-4xx path, just
 * carrying no request content. Anything that isn't this specific shape (a
 * `SyntaxError` from `http-errors`, `status === 400`) passes through
 * untouched.
 */
export function bodyParserErrorMiddleware(
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!isBodyParserSyntaxError(err)) {
    next(err);
    return;
  }

  const safeError = new SyntaxError('Malformed JSON in request body.');
  Object.assign(safeError, { status: 400, statusCode: 400, expose: true });
  next(safeError);
}

function isBodyParserSyntaxError(err: unknown): err is SyntaxError {
  return err instanceof SyntaxError && (err as SyntaxError & { status?: unknown }).status === 400;
}
