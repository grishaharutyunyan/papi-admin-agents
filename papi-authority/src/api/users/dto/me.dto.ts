import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Self-service profile. Deliberately tiny.
 *
 * There is no `email`, `username`, `roleId`, `projectIds` or `isActive` here —
 * and crucially the DB grant agrees: the authority principal holds
 * column-level UPDATE on exactly these fields plus the password ones (0.20,
 * 0.23), so even a code defect on this path cannot escalate a privilege. The
 * DTO and the grant are two independent statements of the same boundary.
 */
export class UpdateMeDto {
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

export class ChangeMyPasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  /** See `user.dto.ts` on why length is the only rule. */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;

  /**
   * The caller's current refresh token, so their own session survives the
   * revocation that follows. Optional, and omitting it is the SAFE direction —
   * every session dies, including the caller's. A wrong or stale value simply
   * spares nothing; it can never spare someone else's session, because the
   * spare is matched by token hash against this user's own rows.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}
