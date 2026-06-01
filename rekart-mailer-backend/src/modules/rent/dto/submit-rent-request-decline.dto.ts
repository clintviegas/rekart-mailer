import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitRentRequestDeclineDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
