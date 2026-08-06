import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PermissionKind } from '$/constants/enums/domain.enums';

/** One L3 grant, addressed exactly as `permission_catalog` keys it. */
export class PermissionRefDto {
  @IsString()
  @MaxLength(64)
  section!: string;

  @IsString()
  @MaxLength(64)
  permissionKey!: string;

  @IsEnum(PermissionKind)
  kind!: PermissionKind;
}

export class CreateUserRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PermissionRefDto)
  permissions?: PermissionRefDto[];
}

export class UpdateUserRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/**
 * Full replacement of a role's grants, never a patch.
 *
 * "Set these permissions" is unambiguous; "add these, remove those" invites a
 * lost update when two admins edit the same role concurrently — the second
 * write would silently resurrect what the first removed.
 */
export class SetRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PermissionRefDto)
  permissions!: PermissionRefDto[];
}
