import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';

import { genericMessageFor, titleFor } from '$/core/errors/problem-details';
import type { ProblemDetails } from '$/core/errors/problem-details';
import { redact } from '$/core/redaction/redact';
import { requestIdFrom } from '$/core/request-context/request-id';

import type { Request, Response } from 'express';

/**
 * Plain `number`, not the `HttpStatus` enum member directly — `exception
 * .getStatus()` returns a bare `number`, and comparing a `number` against an
 * enum member trips `@typescript-eslint/no-unsafe-enum-comparison`.
 */
const INTERNAL_SERVER_ERROR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * The RFC-9457 `application/problem+json` filter — module inventory Part S.2,
 * dossier decision 0.63. Registered globally in EVERY environment via
 * `app.useGlobalFilters(...)` in `main.ts`.
 *
 * ## The contract
 *
 * - **Any `HttpException` with a 4xx status passes its message through
 *   unchanged.** This covers DTO validation failures from the global
 *   `ValidationPipe` (their `message` is always an array of field/constraint
 *   strings — never internal state, safe by construction) AND every
 *   deliberately-thrown business exception (`throw new
 *   ForbiddenException('SSO is disabled for this panel.')`).
 * - **Everything else collapses to ONE generic message per status-code
 *   family**: any exception that is not an `HttpException`, and any
 *   `HttpException` whose status is 5xx, regardless of how it was
 *   constructed. The real detail is logged server-side keyed by the
 *   request id, and that same id is returned in the problem response's
 *   `instance` field.
 *
 * ## Why 4xx-vs-5xx, not "was this message internal"
 *
 * This filter CANNOT mechanically tell a deliberately-authored client-facing
 * message (`throw new ForbiddenException('SSO is disabled for this panel.')`)
 * apart from a hand-constructed one that leaked internal state (`throw new
 * BadRequestException(caughtError.message)`) — both are, at runtime, an
 * `HttpException` carrying a string. Detecting authorial intent is not
 * mechanically possible, so this filter does not attempt it. Instead:
 *
 * - Every 5xx is treated as "something broke" and ALWAYS collapses, whether
 *   it is an uncaught bug or a deliberate `throw new
 *   InternalServerErrorException(...)` — a well-behaved request should not
 *   legitimately need to hand-author a 5xx message that reaches the client,
 *   so collapsing unconditionally costs nothing.
 * - Every 4xx is trusted, by convention, to have been authored deliberately.
 *   That trust is enforced by a CODING RULE, not by this filter: **never
 *   construct an exception's message from a caught error's own
 *   `.message`/response body** — always write a static string and log the
 *   original underneath. See `papi-init-back/CLAUDE.md`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = requestIdFrom(request);

    const { status, body } = this.resolve(exception, requestId);

    if (status >= INTERNAL_SERVER_ERROR || !(exception instanceof HttpException)) {
      this.logCollapsed(exception, status, requestId, request);
    }

    response.status(status).type('application/problem+json').json(body);
  }

  private resolve(exception: unknown, requestId: string): { status: number; body: ProblemDetails } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      if (status < INTERNAL_SERVER_ERROR) {
        return { status, body: this.fromTrustedException(exception, status, requestId) };
      }

      return { status, body: this.genericProblem(status, requestId) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: this.genericProblem(HttpStatus.INTERNAL_SERVER_ERROR, requestId),
    };
  }

  /** A trusted 4xx — pass its message through, structured if it's a validation array. */
  private fromTrustedException(
    exception: HttpException,
    status: number,
    requestId: string,
  ): ProblemDetails {
    const raw = exception.getResponse();

    if (typeof raw === 'string') {
      return {
        type: 'about:blank',
        title: titleFor(status),
        status,
        detail: raw,
        instance: requestId,
      };
    }

    if (raw !== null && typeof raw === 'object') {
      const message = (raw as { message?: unknown }).message;

      if (Array.isArray(message) && message.every((entry) => typeof entry === 'string')) {
        return {
          type: 'about:blank',
          title: titleFor(status),
          status,
          detail: message.join(' '),
          instance: requestId,
          errors: message,
        };
      }

      if (typeof message === 'string') {
        return {
          type: 'about:blank',
          title: titleFor(status),
          status,
          detail: message,
          instance: requestId,
        };
      }
    }

    return { type: 'about:blank', title: titleFor(status), status, instance: requestId };
  }

  private genericProblem(status: number, requestId: string): ProblemDetails {
    return {
      type: 'about:blank',
      title: titleFor(status),
      status,
      detail: genericMessageFor(status),
      instance: requestId,
    };
  }

  private logCollapsed(
    exception: unknown,
    status: number,
    requestId: string,
    request: Request,
  ): void {
    this.logger.error(
      JSON.stringify(
        redact({
          requestId,
          method: request.method,
          path: request.originalUrl ?? request.url,
          status,
          error: this.describeForLog(exception),
        }),
      ),
    );
  }

  /**
   * `SyntaxError` is a deliberate special case (audit finding, Phase 7,
   * 2026-08-31): it is what a malformed-JSON request body surfaces as
   * (`express.json()`'s body-parser throws it straight from `JSON.parse`,
   * uncaught, before this filter's `resolve()` even sees an `HttpException`),
   * and V8's own `JSON.parse` error messages — and `.stack`, whose first line
   * repeats the message — can echo back a short raw snippet of the exact text
   * that failed to parse, e.g. `Unexpected token 'o', "not json at"... is not
   * valid JSON`. That snippet is the caller's own raw request body. Every
   * other logging call site in this service (the proxy services,
   * `papi-authority-caller.ts`, `HttpClientService`) is careful to log only
   * method/path/status/a developer-authored-or-network-level message — this
   * is the one place a body could otherwise reach a log line by construction
   * of the JS runtime, not by anything this codebase wrote. A malformed
   * password-change or login body that trips this path would otherwise leak a
   * body fragment into the server log. Collapsed to a static description
   * instead; every other `Error` subtype's message/stack is developer- or
   * network-authored text with no caller-supplied content by construction,
   * and stays logged in full for real diagnosis.
   */
  private describeForLog(
    exception: unknown,
  ): { name: string; message: string; stack?: string } | { value: string } {
    if (exception instanceof SyntaxError) {
      return {
        name: exception.name,
        message: '[suppressed: SyntaxError may echo raw request body]',
      };
    }

    if (exception instanceof Error) {
      return { name: exception.name, message: exception.message, stack: exception.stack };
    }

    return { value: String(exception) };
  }
}
