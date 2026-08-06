import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  /** Pre-assigned grants, applied atomically at approval (dossier 0.8). */
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

/**
 * The Azure token proving who is accepting. There is no password field — the
 * invitation pipeline is Azure/SSO only (dossier 0.18); password-mode users are
 * created directly by an access-control admin.
 */
export class AcceptInvitationDto {
  @IsString()
  @MaxLength(8192)
  azureToken!: string;

  /** Which panel's Azure configuration to verify against (0.9). */
  @IsString()
  @MaxLength(100)
  panelKey!: string;
}
