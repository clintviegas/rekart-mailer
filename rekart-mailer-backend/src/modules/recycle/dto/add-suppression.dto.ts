import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { SuppressionReason } from '../schemas/recycle-suppression.schema';

export class AddSuppressionDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(SuppressionReason)
  reason?: SuppressionReason;

  @IsOptional()
  @IsString()
  source?: string;
}
