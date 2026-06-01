import { IsOptional, IsString } from 'class-validator';

export class ResendFailedDto {
  @IsOptional()
  @IsString()
  workflowKey?: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
