import { Injectable, Logger } from '@nestjs/common';

/**
 * The generic outbound HTTP wrapper (tech plan Phase 6 / module inventory
 * Part R.3) — formalizes the fetch/timeout pattern `papi-authority-caller.ts`
 * (Phases 1/3/5) already uses ad hoc, as a shared, general-purpose service any
 * future fork can inject for ITS OWN outbound calls (grpc-adjacent REST APIs,
 * a panel's own microservices, etc).
 *
 * This is deliberately NOT a refactor of `papi-authority-caller.ts` — that
 * file encodes a two-class error contract
 * (`UpstreamTrustedError`/`UpstreamCollapsedError`) tuned specifically to
 * papi-authority's own unfiltered-error-shape quirk (dossier 0.63). A generic
 * client has no business knowing papi-authority's particular response shape,
 * so the two coexist rather than being merged.
 *
 * ## The two defects this fixes vs. old papi-back's `HttpRequestService`
 * (module inventory Part R.5)
 *
 * - **Never logs request or response BODY content, for any call, ever.**
 *   The old service logged the full request `data` object on every failed
 *   call (`Logger.error('ERROR POST HttpRequestService', e.message, {path,
 *   data, responseData: e?.response?.data})`) — if a credential-bearing call
 *   (a login proxy, say) ever failed, that logged the plaintext password.
 *   Only method, a SAFE (query-string-stripped) path, status, and the error
 *   message are ever logged here.
 * - **Preserves the real upstream status code.** The old service collapsed
 *   every failure to a generic `BadRequestException()` regardless of the
 *   real status, discarding the 401-vs-500 distinction a caller needs to
 *   make its own decision. `HttpClientError.status` carries the real code
 *   (or `undefined` for a failure that never reached the upstream at all —
 *   a network error or timeout).
 */

const DEFAULT_TIMEOUT_MS = 5_000;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface HttpClientRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpClientResponse<T = unknown> {
  status: number;
  body: T;
}

/**
 * Thrown for every failure mode: network error, timeout, a non-JSON body
 * where JSON was expected, or a non-2xx status. `status` is the REAL upstream
 * status code when one was received, `undefined` when the request never got
 * a response at all (network failure / timeout) — the caller decides what a
 * missing status means, this client never guesses on its behalf.
 *
 * `message` is always a static, developer-authored string (per this
 * service's own exception-filter coding rule) — it never contains request or
 * response body content.
 */
export class HttpClientError extends Error {
  constructor(
    public readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'HttpClientError';
  }
}

/**
 * Strips everything but `origin + pathname` for logging — a query string or
 * URL userinfo segment can itself carry a credential (an API key passed as
 * `?key=...`, a `user:pass@host` URL), and this client's "never log
 * sensitive content" rule applies to the URL exactly as much as to the body.
 */
function safeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[unparseable url]';
  }
}

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);

  get<T = unknown>(
    url: string,
    options?: HttpClientRequestOptions,
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>('GET', url, options);
  }

  post<T = unknown>(
    url: string,
    body?: unknown,
    options?: HttpClientRequestOptions,
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>('POST', url, options, body);
  }

  put<T = unknown>(
    url: string,
    body?: unknown,
    options?: HttpClientRequestOptions,
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>('PUT', url, options, body);
  }

  delete<T = unknown>(
    url: string,
    options?: HttpClientRequestOptions,
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>('DELETE', url, options);
  }

  private async request<T>(
    method: HttpMethod,
    url: string,
    options?: HttpClientRequestOptions,
    body?: unknown,
  ): Promise<HttpClientResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', ...options?.headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logFailure(method, url, undefined, reason);
      throw new HttpClientError(undefined, `Request to upstream failed: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }

    const parsed = await this.parseBody(method, url, response);

    if (!response.ok) {
      this.logFailure(
        method,
        url,
        response.status,
        `upstream responded with status ${response.status}`,
      );
      throw new HttpClientError(
        response.status,
        `Upstream request failed with status ${response.status}.`,
      );
    }

    return { status: response.status, body: parsed as T };
  }

  /**
   * `undefined`/empty bodies (e.g. `204 No Content`) resolve to `null`. A
   * non-empty body that fails to parse as JSON is itself a failure — this
   * client speaks JSON in/out only — but the raw text is never logged or
   * surfaced, only the fact that parsing failed.
   */
  private async parseBody(method: HttpMethod, url: string, response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) return null;

    try {
      return JSON.parse(text) as unknown;
    } catch {
      this.logFailure(method, url, response.status, 'response body was not valid JSON');
      throw new HttpClientError(response.status, 'Upstream returned a non-JSON response body.');
    }
  }

  /** Logs ONLY method/path/status/error-message — never request or response body content. */
  private logFailure(
    method: HttpMethod,
    url: string,
    status: number | undefined,
    reason: string,
  ): void {
    this.logger.error(
      `${method} ${safeUrlForLog(url)} failed (status=${status ?? 'n/a'}): ${reason}`,
    );
  }
}
