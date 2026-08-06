import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { OverrideEffect, PermissionKind } from '$/constants/enums/domain.enums';

export class CatalogRefDto {
  @IsString()
  @MaxLength(64)
  section!: string;

  @IsString()
  @MaxLength(64)
  permissionKey!: string;

  @IsEnum(PermissionKind)
  kind!: PermissionKind;
}

/**
 * L2 — the project's licence, replaced wholesale.
 *
 * A patch API here would be dangerous in a specific way: entitlements are a
 * CEILING, so "add these" silently keeps whatever was already licensed. Stating
 * the full set makes the ceiling explicit at every write.
 */
export class SetProjectEntitlementsDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CatalogRefDto)
  entitlements!: CatalogRefDto[];
}

export class OverrideDto extends CatalogRefDto {
  /**
   * `deny` subtracts from `L2 ∩ L3`; `grant` adds, but only within the
   * project's L2 ceiling (dossier 0.39) — an override can never license a
   * project for something it is not entitled to.
   */
  @IsEnum(OverrideEffect)
  effect!: OverrideEffect;
}

export class SetUserOverridesDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => OverrideDto)
  overrides!: OverrideDto[];
}
