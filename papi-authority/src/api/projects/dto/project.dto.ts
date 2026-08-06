import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { OperatorType, RequiredLevel } from '$/constants/enums/domain.enums';
import { PaginationQueryDto } from '$/core/http/pagination.dto';
import { TransformOptionalBoolean } from '$/core/http/transforms';

/**
 * `project` and `project_db` are identifiers the panels resolve against, not
 * display text — so they are constrained to a safe character set rather than
 * accepted as free-form strings.
 */
const IDENTIFIER = /^[a-zA-Z0-9._-]+$/;

const MAX_MONEY = 1_000_000_000_000;

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(255)
  @Matches(IDENTIFIER, {
    message: 'project may contain only letters, digits, dot, underscore, hyphen',
  })
  project!: string;

  @IsString()
  @MaxLength(255)
  @Matches(IDENTIFIER, {
    message: 'projectDb may contain only letters, digits, dot, underscore, hyphen',
  })
  projectDb!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  projectTz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  theme?: string;

  @IsOptional()
  @IsBoolean()
  isUsingBulkTr?: boolean;

  @IsOptional()
  @IsBoolean()
  isMultiCurrency?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  appTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  additionalTrxTypes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  projectPhoneCountryCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  restoreBetHistoryDaysCount?: number;

  @IsOptional()
  @IsBoolean()
  manualCheckExist?: boolean;
}

/** `project` and `projectDb` are immutable — panels resolve data by them. */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  projectTz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  theme?: string;

  @IsOptional()
  @IsBoolean()
  isUsingBulkTr?: boolean;

  @IsOptional()
  @IsBoolean()
  isMultiCurrency?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  appTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  additionalTrxTypes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  projectPhoneCountryCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  restoreBetHistoryDaysCount?: number;

  @IsOptional()
  @IsBoolean()
  manualCheckExist?: boolean;
}

/**
 * Money fields are bounded on both sides. An unbounded DECIMAL(18,2) accepts
 * values that overflow downstream integer arithmetic in the panels; a negative
 * limit inverts the comparison it feeds.
 */
export class UpsertProjectLimitDto {
  @IsString()
  @MaxLength(255)
  projectKey!: string;

  @IsString()
  @MaxLength(10)
  currency!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  dailyWithdrawLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  sportWinningLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  casinoWinningLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  gamesWinningLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  sportGgrLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  casinoGgrLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  gamesGgrLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  usedUnusedPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rollbackLimitPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  miLimit?: number;
}

export class UpsertProjectOperatorDto {
  @IsString()
  @MaxLength(255)
  opName!: string;

  @IsOptional()
  @IsBoolean()
  autoPushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoApproveEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPushExist?: boolean;

  @IsOptional()
  @IsBoolean()
  autoApproveExist?: boolean;
}

export class UpsertOperatorOpTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(OperatorType)
  type?: OperatorType;

  @IsOptional()
  @IsBoolean()
  autoPushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoApproveEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  manualInsertStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  approvedTrxReports?: boolean;

  @IsOptional()
  @IsEnum(RequiredLevel)
  paymentTrxIdRequiredLevel?: RequiredLevel;

  @IsOptional()
  @IsEnum(RequiredLevel)
  remoteTrxIdRequiredLevel?: RequiredLevel;

  @IsOptional()
  @IsEnum(RequiredLevel)
  reasonRequiredLevel?: RequiredLevel;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  currencies?: string[];
}

export class SetProjectBlockersDto {
  @IsOptional()
  @IsObject()
  playerBlockers?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  reason?: string[];
}

export class ProjectQueryDto extends PaginationQueryDto {
  @IsOptional()
  @TransformOptionalBoolean()
  @IsBoolean()
  isActive?: boolean;
}
