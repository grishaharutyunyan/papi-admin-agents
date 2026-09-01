import type { Request } from 'express';

/**
 * The caller-identifying facts this service forwards on every proxied call to
 * papi-authority (Part P.6) — `req.ip` is only trustworthy here because
 * `trust proxy`/`TRUSTED_PROXY_HOPS` was configured at bootstrap (`main.ts`),
 * mirroring papi-authority's own `contextOf` helper in its `auth.controller.ts`.
 *
 * KNOWN-INCOMPLETE STORY (Part P.6): this is correct for a direct
 * fork-to-authority call today. It is NOT yet proven for a real multi-hop
 * deployment with a load balancer in front of this fork too — that requires
 * both services to agree on `TRUSTED_PROXY_HOPS` so each hop's
 * `X-Forwarded-For` addition is trustworthy end to end. Out of scope until a
 * real deployment needs it (see tech plan's "Later phases").
 */
export interface OutboundContext {
  ip: string | null;
  userAgent: string | null;
}

const MAX_USER_AGENT_LENGTH = 512;

export function outboundContextOf(request: Request): OutboundContext {
  const userAgent = request.headers['user-agent'];

  return {
    ip: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}

/**
 * Turns an `OutboundContext` into the headers set on this service's OWN
 * outbound call to papi-authority — `X-Forwarded-For` so papi-authority's
 * audit/lockout keys the real end user, not this service's egress IP, plus
 * `User-Agent` passthrough. Only set when present; papi-authority's own audit
 * fields already tolerate `null`.
 */
export function forwardingHeaders(context: OutboundContext): Record<string, string> {
  const headers: Record<string, string> = {};

  if (context.ip) headers['X-Forwarded-For'] = context.ip;
  if (context.userAgent) headers['User-Agent'] = context.userAgent;

  return headers;
}
