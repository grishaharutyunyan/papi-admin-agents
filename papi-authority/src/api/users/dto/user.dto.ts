import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '$/core/http/pagination.dto';
import { TransformOptionalBoolean } from '$/core/http/transforms';

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * Minimum 12, and no composition rules.
 *
 * Length is the only requirement that reliably correlates with strength;
 * mandatory symbol/digit classes push people toward `Password1!` and are
 * explicitly discouraged by NIST SP 800-63B. The temporary password issued here
 * is machine-generated anyway, and the user must replace it at first login
 * (dossier 0.22).
 */
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

/**
 * Direct creation — the PASSWORD-MODE path (dossier 0.18/0.22).
 *
 * SSO users never arrive here: they come through invitation approval, which is
 * the only path that attaches a verified Azure `oid`. There is deliberately no
 * `oid` field on this DTO, so an admin cannot hand-assign an Azure identity to
 * an account and bypass the proof-of-sign-in step.
 */
export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(USERNAME_PATTERN, {
    message: 'username may contain only letters, digits, dot, underscore and hyphen',
  })
  username!: string;

  /**
   * Optional. When omitted the account is created with no password and is
   * unusable until one is set — which is the right default, because a password
   * arriving in a request body is one that has been typed, logged upstream, or
   * pasted into a ticket.
   */
  @IsOptional()
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  temporaryPassword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  /**
   * **`'7'`, not `'4'`.** Every primary key in this platform is a UUIDv7
   * (dossier 0.27), and `@IsUUID('4')` REJECTS a v7 — the version nibble
   * differs. Validating for v4 here silently 400s every real role id, which is
   * exactly what happened before this was corrected.
   *
   * Azure identifiers (`ssoTenantId`, `ssoClientId`) are v4 and are validated
   * with an unversioned `@IsUUID()` for that reason.
   */
  @IsOptional()
  @IsUUID('7')
  roleId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Type(() => String)
  projectIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Type(() => String)
  adminPanelIds?: string[];

  /** Defaults to false — an account is inert until deliberately activated. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Update.
 *
 * `email`, `username` and `oid` are absent by design. Changing the address or
 * the Azure identity on an existing row silently repoints every audit event,
 * grant and session already attached to that person; re-invitation is the
 * supported path. `password` is absent too — it has its own endpoint, so a
 * profile edit can never carry credentials.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;
}

/** Role and membership changes — separated because they revoke sessions (0.46). */
export class UpdateUserAccessDto {
  @IsOptional()
  @IsUUID('7')
  roleId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Type(() => String)
  projectIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Type(() => String)
  adminPanelIds?: string[];
}

export class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

export class SetTemporaryPasswordDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

export class UnauthorizeUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class UserQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('7')
  roleId?: string;

  @IsOptional()
  @TransformOptionalBoolean()
  @IsBoolean()
  isActive?: boolean;
}
