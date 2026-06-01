import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateRecycleTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsEmail({}, { message: 'recipientEmail must be a valid email' })
  @IsOptional()
  recipientEmail?: string;

  @IsObject()
  @IsOptional()
  dynamicFieldValues?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  previewSnapshot?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  htmlTemplate?: string;
}
