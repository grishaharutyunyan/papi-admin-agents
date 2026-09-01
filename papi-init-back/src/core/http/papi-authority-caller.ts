/**
 * The shared shape of the outbound calls this service makes to papi-authority
 * from `auth`, `sso`, and (Phase 5) `users/me*` — extracted once Phase 3
 * brought the call count to five, so the fetch/timeout/classify logic isn't
 * re-typed at each call site (module inventory Part R.5 / tech plan Phase 3
 * deliverable 4). This is deliberately NOT the full generic HTTP-client
 * module (that's Phase 6's `src/core/http-client/`) — it only knows how to
 * talk to papi-authority specifically.
 *
 * **`app-init.service.ts` does NOT use this** (code review, 2026-08-30 —
 * corrects an earlier version of this docstring that wrongly claimed it did).
 * It's a `GET` with a query-string param and a distinct response DTO, calling
 * `fetch` directly with the same timeout/generic-collapse shape — close
 * enough in spirit to belong to the same family, but different enough in
 * mechanics (no request body, no `UpstreamTrustedError`/`UpstreamCollapsedError`
 * classification, since the public `/api/app-init` route only ever needs
 * "succeeded or collapse to 503") that forcing it through this GET/POST/PATCH
 * abstraction would blur rather than clarify. If a sixth near-identical call
 * site appears, that's the point to revisit unifying them, not before.
 *
 * ## The two-class error contract (papi-authority has no exception filter —
 * dossier 0.63)
 *
 * papi-authority's own error responses are NestJS's default shape for
 * whatever it threw: `{statusCode, message, error}`, where `message` is
 * either a string or an array of validation strings. Those messages are
 * deliberately client-safe by papi-authority's OWN design (uniform
 * login-failure wording, no information disclosure) — forwarding one is
 * correct, not a violation of "never forward a caught error's raw message."
 *
 * - A **4xx with a recognizable message shape** throws {@link UpstreamTrustedError}
 *   — the caller re-throws it locally as an `HttpException` with the SAME
 *   status and message, which then passes through `AllExceptionsFilter`
 *   unchanged (its 4xx-passthrough rule). Phase 5's proxies rely on this
 *   for a genuinely-expired/invalid token slipping past this service's own
 *   `JwtGuard` and being rejected by papi-authority itself — that 401 IS a
 *   trusted 4xx and is forwarded unchanged, same rule as every other one.
 * - **Everything else** — network failure, timeout, non-JSON body, a 5xx, or
 *   a 4xx whose body doesn't match the expected shape — throws
 *   {@link UpstreamCollapsedError}. The caller must catch this and throw its
 *   OWN static, generic exception; never forward `.message` from this error
 *   to a client.
 *
 * ## GET / PATCH and forwarding the caller's own `Authorization` header
 *
 * Phase 3's proxies (auth/sso) never had an inbound token to forward — login
 * IS how a token is obtained. Phase 5's self-service proxies (`users/me*`)
 * are different: the caller already holds their own access token, and
 * papi-authority's `MeController` requires it (it is not `@Public()`). There
 * is nothing special-cased for this in the function signature — `Authorization`
 * is just another entry in `options.headers`, same as `X-Forwarded-For` — but
 * every Phase 5 call site sets it, and every Phase 3 call site never does.
 */

import { HttpException, ServiceUnavailableException } from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 5_000;

/** GET carries no body; PATCH/POST do. */
export type PapiAuthorityMethod = 'GET' | 'POST' | 'PATCH';

export interface PapiAuthorityCallOptions {
  /** e.g. `/api/auth/login`, `/api/users/me` */
  path: string;
  /** Omit for GET. */
  body?: unknown;
  /**
   * Extra outbound headers — e.g. `x-admin-panel-key`, `X-Forwarded-For`, or
   * (Phase 5) the caller's own `Authorization: Bearer <token>` forwarded
   * unchanged.
   */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface PapiAuthoritySuccess {
  status: number;
  body: unknown;
}

/** A 4xx from papi-authority whose message is safe to forward unchanged. */
export class UpstreamTrustedError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamTrustedError';
  }
}

/** Anything that must collapse to a generic, locally-authored message. */
export class UpstreamCollapsedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UpstreamCollapsedError';
  }
}

/**
 * Extracts a client-safe message from papi-authority's default (filterless)
 * NestJS error shape. Returns `undefined` if the body doesn't match that
 * shape — the caller then collapses rather than guessing.
 */
function extractUpstreamMessage(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const message = (body as Record<string, unknown>).message;

  if (typeof message === 'string') return message;
  if (Array.isArray(message) && message.every((entry) => typeof entry === 'string')) {
    return message.join(' ');
  }

  return undefined;
}

/**
 * Calls papi-authority at `baseUrl + path` with the given method,
 * timeout-bounded.
 *
 * Resolves with the parsed 2xx body. Rejects with {@link UpstreamTrustedError}
 * for a classifiable 4xx, or {@link UpstreamCollapsedError} for everything
 * else (network error, timeout, non-JSON body, 5xx, or unrecognized 4xx
 * shape). Never throws a raw `Error`/`TypeError` from `fetch` itself.
 *
 * Internal — call one of the method-named wrappers below instead, so every
 * call site states its method at the call, not buried in an options object.
 */
async function callPapiAuthority(
  method: PapiAuthorityMethod,
  baseUrl: string,
  options: PapiAuthorityCallOptions,
): Promise<PapiAuthoritySuccess> {
  const url = new URL(options.path, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...options.headers },
      // A GET carries no body — some HTTP clients/servers reject a GET that
      // has one, and papi-authority's GET routes here never expect one.
      ...(method === 'GET' ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new UpstreamCollapsedError(
      `network failure calling ${options.path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown;
  try {
    parsed = response.status === 204 ? null : await response.json();
  } catch (error) {
    throw new UpstreamCollapsedError(
      `non-JSON body from ${options.path}, status=${response.status}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response.ok) {
    return { status: response.status, body: parsed };
  }

  if (response.status >= 400 && response.status < 500) {
    const message = extractUpstreamMessage(parsed);
    if (message === undefined) {
      throw new UpstreamCollapsedError(
        `4xx from ${options.path} with an unrecognized body shape, status=${response.status}`,
      );
    }
    throw new UpstreamTrustedError(response.status, message);
  }

  throw new UpstreamCollapsedError(`upstream 5xx from ${options.path}, status=${response.status}`);
}

/** POSTs JSON to papi-authority. Used by Phase 3's login/refresh/logout/sso and Phase 5's password-change proxy. */
export function postToPapiAuthority(
  baseUrl: string,
  options: PapiAuthorityCallOptions,
): Promise<PapiAuthoritySuccess> {
  return callPapiAuthority('POST', baseUrl, options);
}

/**
 * GETs from papi-authority. `options.body` is ignored (a GET never sends
 * one) — Phase 5's `GET /users/me` and `GET /users/me/projects` proxies.
 */
export function getFromPapiAuthority(
  baseUrl: string,
  options: Omit<PapiAuthorityCallOptions, 'body'>,
): Promise<PapiAuthoritySuccess> {
  return callPapiAuthority('GET', baseUrl, options);
}

/** PATCHes JSON to papi-authority — Phase 5's `PATCH /users/me` proxy. */
export function patchToPapiAuthority(
  baseUrl: string,
  options: PapiAuthorityCallOptions,
): Promise<PapiAuthoritySuccess> {
  return callPapiAuthority('PATCH', baseUrl, options);
}

/**
 * Applies the two-class contract documented above to a caught error and
 * throws the correct local exception — factored out (code review, 2026-08-30)
 * because `AuthService.proxy`, `SsoService.login`, and `MeService.proxy`/
 * `MeService.changeMyPassword` had each hand-written this exact
 * `instanceof UpstreamTrustedError ? … : …` dispatch, which meant a future
 * fix to the classification (e.g. distinguishing a timeout from a genuine
 * 5xx) required patching every copy, and a missed copy would have silently
 * reintroduced raw-message forwarding. Always throws — never returns.
 *
 * Does NOT handle "the try block itself threw a `ServiceUnavailableException`
 * for an unrecognized response shape" — that check stays at each call site
 * (`if (error instanceof ServiceUnavailableException) throw error;`), since
 * only the caller knows whether its own try block can produce that case.
 */
export function throwForProxyError(
  error: unknown,
  logger: { error: (message: string) => void },
  path: string,
  genericMessage: string,
): never {
  if (error instanceof UpstreamTrustedError) {
    // papi-authority's own 4xx message is already client-safe by design
    // (dossier 0.63) — re-thrown unchanged, same status, so
    // AllExceptionsFilter's 4xx-passthrough rule applies.
    throw new HttpException(error.message, error.status);
  }

  const detail =
    error instanceof UpstreamCollapsedError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  logger.error(`${path} proxy call failed: ${detail}`);
  throw new ServiceUnavailableException(genericMessage);
}
