import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Shared list-query shape for every future CRUD surface a fork adds.
 *
 * Copied verbatim from papi-authority's `src/core/http/pagination.dto.ts` —
 * this IS the platform's pagination convention, not a papi-init-back-specific
 * one. `limit` is CAPPED, not merely defaulted: an uncapped page size lets a
 * client pull an entire table in one call, turning a single
 * over-permissioned account into a bulk export (module inventory Part S.1).
 *
 * `order` is DIRECTION ONLY, never a client-controlled column. Old papi-back's
 * `parseGetPaginationParams`/`orm.service.ts` took the sort column and even a
 * `select`/`relations` filter straight from the client with no allowlist,
 * letting a caller request columns like `password` on any endpoint built on
 * it (Part S.1) — that pattern is NOT ported. A paginated endpoint built on
 * this DTO must hardcode its own sortable/searchable column(s) in the
 * service; `order`/`search` from the client only ever select *behavior*,
 * never *which column*. See papi-init-back/CLAUDE.md.
 *
 * `@Type(() => Number)` is required because the global ValidationPipe runs
 * without `enableImplicitConversion` (papi-authority's deliberate divergence
 * from papi-back): query strings arrive as strings and must be converted
 * explicitly, so a non-numeric `limit` is a 400 rather than a silent `NaN`.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Free-text filter; the meaning is per-endpoint. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;

export function pageParams(query: PaginationQueryDto): {
  skip: number;
  take: number;
  page: number;
} {
  const page = query.page ?? DEFAULT_PAGE;
  const take = query.limit ?? DEFAULT_LIMIT;

  return { skip: (page - 1) * take, take, page };
}

export function paginated<T>(
  items: T[],
  total: number,
  query: PaginationQueryDto,
): PaginatedResult<T> {
  const { page, take } = pageParams(query);
  return { items, total, page, limit: take };
}
