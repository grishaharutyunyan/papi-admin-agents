import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { AuthEventOutcome } from '$/constants/enums/domain.enums';
import { PaginationQueryDto } from '$/core/http/pagination.dto';

/**
 * Audit search (dossier 0.55).
 *
 * `search` is inherited but deliberately unused: free-text over an append-only
 * table of tens of millions of rows is a `LIKE '%…%'` full scan. Every filter
 * here maps to an indexed column or narrows one that does.
 */
export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  eventType?: string;

  @IsOptional()
  @IsEnum(AuthEventOutcome)
  outcome?: AuthEventOutcome;

  @IsOptional()
  @IsUUID('7')
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @IsOptional()
  @IsUUID('7')
  adminPanelId?: string;

  /** Exact match — "everything from this address", the core incident query. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  geoCountry?: string;

  /** Ties every action back to one access token. */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  jti?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;

  /**
   * ISO-8601. `@Type(() => Date)` is required because the global
   * ValidationPipe runs without `enableImplicitConversion`, so an unparseable
   * date fails `@IsDate()` with a 400 rather than silently becoming
   * `Invalid Date` and matching nothing.
   */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsIn(['createdAt', 'eventType'])
  sortBy?: 'createdAt' | 'eventType';
}
