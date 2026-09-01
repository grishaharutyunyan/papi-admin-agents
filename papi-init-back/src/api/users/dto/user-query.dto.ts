import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '$/core/http/pagination.dto';
import { TransformOptionalBoolean } from '$/core/http/transforms';

/**
 * Query shape for the read-only `GET /api/users` proxy — mirrors
 * papi-authority's own `UserQueryDto` (`src/api/users/dto/user.dto.ts`)
 * field-for-field, since this DTO's only job is to validate what gets
 * forwarded as papi-authority's own querystring. Extends the shared
 * `PaginationQueryDto` rather than redeclaring `page`/`limit`/`search`/`order`.
 */
export class UserQueryDto extends PaginationQueryDto {
  /**
   * **`'7'`, not `'4'`** — every primary key on this platform is a UUIDv7
   * (papi-authority dossier 0.27); `@IsUUID('4')` would reject a real role id.
   */
  @IsOptional()
  @IsUUID('7')
  roleId?: string;

  @IsOptional()
  @TransformOptionalBoolean()
  @IsBoolean()
  isActive?: boolean;
}
