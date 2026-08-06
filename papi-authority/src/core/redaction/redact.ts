/**
 * The redaction ruleset (dossier 0.56).
 *
 * This service has **no logger** — the company-standard package is supplied at
 * the final step (0.15), and until then `no-console` is an ESLint error. What
 * ships here is the ruleset that package will consume, built and tested now so
 * the integration is a wiring change rather than a security design exercise
 * done under time pressure.
 *
 * It is also directly useful before then: anything that ever serialises a
 * request body, a DTO or an error payload should pass it through `redact`.
 */

export const REDACTED = '[redacted]';

/**
 * Matched case-insensitively against the KEY, as a substring.
 *
 * Substring rather than exact match is deliberate: `newPassword`,
 * `currentPassword`, `password_hash` and `oldPassword` must all be caught, and
 * an allow-list of exact names is exactly the thing that goes stale the first
 * time somebody adds a field. Over-redacting a log line is harmless;
 * under-redacting one is not.
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
 * needed for investigation.
 *
 * `tokenEpoch` is a counter. `jti` is a token *identifier* — it is already
 * stored in the audit trail on purpose, so that a specific access token can be
 * traced; redacting it would break the correlation it exists for.
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

  // An Error's own enumerable properties can carry a DTO; keep the message and
  // name, redact the rest.
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED : walk(entry, depth + 1, seen);
  }

  return output;
}

/**
 * Header redaction, for the same reason and by the same rules. Kept separate
 * because header names are conventionally hyphenated and lower-cased, and
 * because `authorization` and `cookie` are the two that matter most.
 */
export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    output[key] = isSensitiveKey(key.replace(/-/g, '')) ? REDACTED : value;
  }

  return output;
}
