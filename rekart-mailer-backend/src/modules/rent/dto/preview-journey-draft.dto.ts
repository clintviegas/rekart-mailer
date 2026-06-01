import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class PreviewJourneyDraftDto {
  @IsString()
  @IsIn(['rent-request'])
  step!: string;

  @IsString()
  customerName!: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  requestId?: string;

  @IsObject()
  @IsOptional()
  dynamicData?: Record<string, unknown>;

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
