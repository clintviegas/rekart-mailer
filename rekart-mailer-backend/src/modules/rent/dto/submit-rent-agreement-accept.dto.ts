import { Equals, IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitRentAgreementAcceptDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  signerName: string;

  /** PNG data URL from canvas signature pad */
  @IsString()
  @MinLength(32)
  @MaxLength(150_000)
  signatureImage: string;

  /** Display date agreed by signer (DD/MM/YY) */
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  signedDate: string;

  @IsBoolean()
  @Equals(true, { message: 'Electronic signature consent is required' })
  consentGiven: boolean;
}
