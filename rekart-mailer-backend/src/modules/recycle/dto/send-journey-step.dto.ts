import {
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class SendJourneyStepDto {
  /** Override the dynamic field values for this specific step */
  @IsObject()
  @IsOptional()
  dynamicData?: Record<string, unknown>;

  /** Subject override — falls back to the saved template default */
  @IsString()
  @IsOptional()
  subjectOverride?: string;

  // ── Per-email branding overrides ──────────────────────────────────────────
  @IsString()
  @IsOptional()
  customSignoffName?: string;

  @IsString()
  @IsOptional()
  customFooterNote?: string;

  @IsString()
  @IsOptional()
  customGreetingText?: string;

  @IsString()
  @IsOptional()
  customHeadingColor?: string;

  @IsString()
  @IsOptional()
  customBodyTextColor?: string;

  @IsString()
  @IsOptional()
  customButtonLabel?: string;
}
