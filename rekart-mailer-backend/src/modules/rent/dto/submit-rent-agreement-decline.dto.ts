import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitRentAgreementDeclineDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  declineReason: string;

  /** Optional note from customer (e.g. what they want changed). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerNote?: string;
}
