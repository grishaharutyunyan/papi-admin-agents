import { IsString, Length } from 'class-validator';

/**
 * Deliberately NO `panelKey` field — same reasoning as `LoginDto`: this
 * service supplies its own configured `PANEL_KEY`, never trusting a
 * client-supplied one.
 */
export class SsoLoginDto {
  @IsString()
  @Length(1, 8192)
  azureToken!: string;
}
