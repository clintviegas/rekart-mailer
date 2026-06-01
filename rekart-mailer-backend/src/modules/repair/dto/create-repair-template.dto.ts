import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateRepairTemplateDto {
  @IsString()
  @IsNotEmpty()
  workflowKey: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsEmail({}, { message: 'recipientEmail must be a valid email' })
  recipientEmail: string;

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
