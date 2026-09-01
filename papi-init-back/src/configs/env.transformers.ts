import type { TransformFnParams } from 'class-transformer';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off', '']);

/**
 * Environment variables are always strings, so booleans need explicit,
 * unambiguous coercion. We do NOT rely on class-transformer's implicit
 * conversion here: `Boolean('false')` is `true`, which would silently turn a
 * disabled security flag into an enabled one. Copied from papi-authority's
 * `env.transformers.ts` — same platform rule, same rationale.
 */
export function toBoolean(params: TransformFnParams): boolean | undefined {
  const value: unknown = params.value;

  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return undefined;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY.has(normalized)) return true;
    if (FALSY.has(normalized)) return false;
  }

  // Anything else is a configuration mistake — surface it as an invalid value
  // rather than guessing. @IsBoolean() on the property will reject it.
  return undefined;
}

/** Comma-separated list -> trimmed, non-empty string array. */
export function toStringArray(params: TransformFnParams): string[] {
  const value: unknown = params.value;

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value !== 'string') return [];

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
