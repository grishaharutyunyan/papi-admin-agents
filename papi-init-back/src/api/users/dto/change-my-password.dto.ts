import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Mirrors papi-authority's own `ChangeMyPasswordDto`. `refreshToken` is the
 * CALLER'S OWN current refresh token: passing it lets their own session
 * survive the revocation papi-authority performs after a successful change;
 * omitting it is the safe default — every session, including the caller's,
 * is revoked. A wrong/stale value can never spare someone else's session,
 * since papi-authority matches it by hash against this user's own rows only.
 */
export class ChangeMyPasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}
