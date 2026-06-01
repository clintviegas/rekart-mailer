import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/** Preview email HTML before a journey exists (e.g. New SELL Request modal). */
export class PreviewJourneyDraftDto {
  /** Only steps that do not require an existing journey / token context for draft preview. */
  @IsString()
  @IsIn(['request-received', 'pickup-scheduled', 'inspection-underway'])
  step!: string;

  @IsString()
  customerName!: string;

  @IsString()
  @IsOptional()
  currency?: string;

  /** Shown in template as {{requestId}} — defaults to PREVIEW on the server if empty */
  @IsString()
  @IsOptional()
  requestId?: string;

  @IsObject()
  @IsOptional()
  dynamicData?: Record<string, unknown>;

  // ── Same optional overrides as SendJourneyStepDto (subset used in UI) ─────
  @IsString()
  @IsOptional()
  subjectOverride?: string;

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
