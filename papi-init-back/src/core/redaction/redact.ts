/**
 * The redaction ruleset, ported verbatim from papi-authority's
 * `src/core/redaction/redact.ts` (dossier 0.56) — this service has no logger
 * either (same deferral, `no-console` stays an ESLint error), and the
 * exception filter (`src/core/errors/`) is the first thing here that ever
 * serialises caught error state, so the ruleset lands in Phase 1 rather than
 * waiting for Phase 7.
 */

export const REDACTED = '[redacted]';

/**
 * Matched case-insensitively against the KEY, as a substring. Substring
 * rather than exact match is deliberate: `newPassword`, `currentPassword`,
 * `password_hash` and `oldPassword` must all be caught, and an allow-list of
 * exact names is exactly the thing that goes stale the first time somebody
 * adds a field. Over-redacting a log line is harmless; under-redacting one is
 * not.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'credential',
  'apikey',
  'api_key',
  'private_key',
  'privatekey',
  'connectionstring',
  'connection_string',
] as const;

/**
 * Keys that LOOK sensitive by the rule above but carry no secret and are
 * needed for investigation. `jti` is a token *identifier*, not the token
 * itself — redacting it would break the correlation it exists for.
 */
const EXEMPT_KEYS = new Set(['tokenepoch', 'jti', 'tokentype', 'tokenttl']);

const MAX_DEPTH = 8;

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (EXEMPT_KEYS.has(lower)) return false;

  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Returns a redacted deep copy. The input is never mutated — a redactor that
 * modified the object it was handed would corrupt the request it was meant to
 * make safe to log.
 *
 * Cycles and excessive depth are bounded rather than fatal: a redactor that
 * throws inside an error handler turns a logged problem into an unlogged one.
 */
export function redact<T>(value: T): T {
  return walk(value, 0, new WeakSet()) as T;
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => walk(entry, depth + 1, seen));
  }

  // An Error's own enumerable properties can carry a DTO; keep the message
  // and name, redact the rest.
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED : walk(entry, depth + 1, seen);
  }

  return output;
}

/** Header redaction, for the same reason and by the same rules. */
export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    output[key] = isSensitiveKey(key.replace(/-/g, '')) ? REDACTED : value;
  }

  return output;
}
