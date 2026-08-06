import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Approval overrides.
 *
 * Every field is optional and defaults to what the invitation already carries.
 * The approver reviews the request and may adjust the grants before the
 * identity exists — which is the point of approval being a separate act from
 * acceptance (dossier 0.8): what the invitee proved is who they are, not what
 * they may do.
 */
export class ApproveInvitationDto {
  /**
   * Defaults to the local part of the invited email. Supplied explicitly when
   * that is already taken.
   */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'username may contain only letters, digits, dot, underscore and hyphen',
  })
  username?: string;

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
}

export class RejectInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
