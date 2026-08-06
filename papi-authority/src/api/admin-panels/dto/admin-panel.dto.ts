import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const PANEL_KEY = /^[A-Z0-9_]+$/;

export class CreateAdminPanelDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  /** Upper-case identifier the forks send as `panelKey` — e.g. `RMP`. */
  @IsString()
  @MaxLength(100)
  @Matches(PANEL_KEY, { message: 'panelKey may contain only A-Z, 0-9 and underscore' })
  panelKey!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  theme?: string;
}

/** `panelKey` is immutable: the forks identify themselves by it at login. */
export class UpdateAdminPanelDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  theme?: string;
}

/**
 * Per-panel authentication configuration (dossier 0.4/0.5).
 *
 * These two booleans decide which credentials a panel accepts at all:
 * `basic_auth_enabled` gates password login AND password change (0.22),
 * `sso_auth_enabled` gates the Azure login and invitation acceptance.
 *
 * The tenant/client ids are NULLABLE OVERRIDES (0.9). NULL means "use the
 * platform default", which is the normal case — the whole platform shares one
 * Azure app registration. They exist only for a panel that ever needs its own
 * tenant, and setting one is a deliberate divergence, not configuration.
 */
export class ConfigureAdminPanelAuthDto {
  @IsBoolean()
  basicAuthEnabled!: boolean;

  @IsBoolean()
  ssoAuthEnabled!: boolean;

  /**
   * Azure tenant GUID, or `null` to fall back to the platform default.
   * `ValidateIf` lets an explicit `null` through while still rejecting a
   * malformed value — omitting the field leaves the current setting alone.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ssoTenantId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ssoClientId?: string | null;
}
