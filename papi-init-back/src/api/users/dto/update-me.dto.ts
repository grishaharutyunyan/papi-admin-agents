import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Mirrors papi-authority's own `UpdateMeDto` field-for-field (same lengths,
 * same optionality) — this service validates only well-formedness before
 * forwarding; papi-authority remains the authority on what is actually
 * writable (its DB grant is the real boundary, dossier 0.20/0.23).
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
