import { IsString, Length } from 'class-validator';

/**
 * Deliberately NO `panelKey` field (unlike papi-authority's own `LoginDto`,
 * which the front-end there must supply since it can serve many panels).
 * This service represents exactly one panel — its own `PANEL_KEY` config —
 * so the caller is never trusted to assert one (tech plan Phase 3
 * deliverable 1 / dossier 0.35).
 */
export class LoginDto {
  @IsString()
  @Length(1, 255)
  username!: string;

  @IsString()
  @Length(1, 512)
  password!: string;
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
