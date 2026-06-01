import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendDeviceReshipDto {
  @IsString()
  @MinLength(1)
  courierName: string;

  @IsString()
  @MinLength(1)
  trackingNumber: string;

  /**
   * Optional public tracking URL — renders a "Track Now" button in the email.
   * Must be http(s). Courier and tracking stay in the details table only.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  trackingUrl?: string;

  /** Optional note from staff — shown in the customer email (plain text). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customMessage?: string;
}
