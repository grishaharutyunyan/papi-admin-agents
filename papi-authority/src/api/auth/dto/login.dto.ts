import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  /** Username or email — resolved case-insensitively. */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  username!: string;

  /**
   * No MinLength beyond 1: rejecting a short password here would leak the
   * policy to an unauthenticated caller and changes nothing, since a wrong
   * password fails anyway. `MaxLength` exists only to bound the argon2 work an
   * anonymous request can trigger.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  password!: string;

  /** Which admin panel is being logged into (dossier 0.35). */
  @IsString()
  @Length(1, 100)
  panelKey!: string;
}

export class RefreshDto {
  @IsString()
  @Length(1, 512)
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  @Length(1, 512)
  refreshToken!: string;
}
