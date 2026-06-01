import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RepairJourneyCurrency } from '../schemas/repair-request-journey.schema';

export class AttachmentRefDto {
  @IsString() storedFilename: string;
  @IsString() originalName: string;
  @IsString() mimeType: string;
  @IsOptional() size?: number;
  @IsOptional() @IsString() url?: string;
}

export class CreateJourneyDto {
  @IsEmail({}, { message: 'customerEmail must be a valid email' })
  customerEmail: string;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsEnum(RepairJourneyCurrency, {
    message: `currency must be one of: ${Object.values(RepairJourneyCurrency).join(', ')}`,
  })
  @IsOptional()
  currency?: RepairJourneyCurrency;

  @IsObject()
  @IsOptional()
  dynamicData?: Record<string, unknown>;

  /** Attachment refs from the upload endpoint — stored on the journey */
  @IsOptional()
  @IsArray()
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];
}
