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
import { AttachmentRefDto } from './send-test-email.dto';

export class SendEmailDto {
  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsNotEmpty()
  workflowKey: string;

  @IsEmail({}, { message: 'recipientEmail must be a valid email' })
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
