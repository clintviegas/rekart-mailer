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
import { RentJourneyCurrency } from '../schemas/rent-request-journey.schema';

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

  @IsEnum(RentJourneyCurrency, {
    message: `currency must be one of: ${Object.values(RentJourneyCurrency).join(', ')}`,
  })
  @IsOptional()
  currency?: RentJourneyCurrency;

  @IsObject()
  @IsOptional()
  dynamicData?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];
}
