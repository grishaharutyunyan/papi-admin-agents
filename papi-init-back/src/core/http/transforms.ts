import { Transform } from 'class-transformer';

/**
 * Query-string boolean.
 *
 * NEVER use `@Type(() => Boolean)` for this: `Boolean('false')` is `true`, so
 * `?isActive=false` would silently filter for ACTIVE rows — a filter that
 * returns the exact opposite of what was asked for, with no error anywhere.
 * This service bans implicit conversion globally for this class of reason
 * (`pagination.dto.ts`'s own docstring makes the same point for `page`/`limit`).
 *
 * Only the two exact literals convert. Anything else passes through unchanged
 * and fails the `@IsBoolean()` that follows, so a malformed value is a 400
 * rather than a guess. Copied verbatim from papi-authority's own
 * `src/core/http/transforms.ts` — same platform rule, same rationale.
 */
export const TransformOptionalBoolean = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }): unknown => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
