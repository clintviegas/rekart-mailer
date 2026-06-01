import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttachmentRefDto {
  @IsString()
  storedFilename: string;

  @IsString()
  originalName: string;

  @IsString()
  mimeType: string;

  @IsOptional()
  size?: number;

  @IsString()
  @IsOptional()
  url?: string;
}

export class SendTestEmailDto {
  @IsString()
  @IsNotEmpty()
  workflowKey: string;

  @IsEmail({}, { message: 'recipientEmail must be a valid email address' })
  recipientEmail: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsObject()
  @IsOptional()
  dynamicFieldValues?: Record<string, unknown>;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];

  // ── Per-email overrides ────────────────────────────────────────────────────
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
