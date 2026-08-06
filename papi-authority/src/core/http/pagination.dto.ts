import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Shared list-query shape for every CRUD surface.
 *
 * `limit` is CAPPED, not merely defaulted. An uncapped page size on an identity
 * listing lets one request pull the entire user table, which turns a single
 * over-permissioned account into a bulk export. The forks accept whatever
 * `limit` the caller sends.
 *
 * `@Type(() => Number)` is required because the global ValidationPipe runs
 * without `enableImplicitConversion` (a deliberate divergence from papi-back):
 * query strings arrive as strings and must be converted explicitly, so a
 * non-numeric `limit` is a 400 rather than a silent `NaN`.
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
