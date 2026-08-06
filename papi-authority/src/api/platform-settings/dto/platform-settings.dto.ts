import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * The platform's default Azure app registration (dossier 0.9).
 *
 * `null` clears the value; omitting the field leaves it alone. `ValidateIf`
 * lets an explicit `null` through while still rejecting a malformed GUID —
 * without it, `@IsUUID()` would reject the intentional clear.
 */
export class UpdatePlatformSettingsDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ssoTenantId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ssoClientId?: string | null;
}
