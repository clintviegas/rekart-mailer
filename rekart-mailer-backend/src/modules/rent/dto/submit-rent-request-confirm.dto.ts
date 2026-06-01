import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class RentRequestItemDto {
  @IsString()
  name: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  qty: number;
}

export class SubmitRentRequestConfirmDto {
  @IsIn(['pickup', 'delivery'])
  fulfillmentMode: 'pickup' | 'delivery';

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  rentalStartDate: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  rentalEndDate: string;

  @ValidateIf((o: SubmitRentRequestConfirmDto) => o.fulfillmentMode === 'pickup')
  @IsString()
  @MinLength(1)
  pickupLocationId?: string;

  @ValidateIf((o: SubmitRentRequestConfirmDto) => o.fulfillmentMode === 'delivery')
  @IsIn(['saved', 'different'])
  addressMode?: 'saved' | 'different';

  @ValidateIf(
    (o: SubmitRentRequestConfirmDto) =>
      o.fulfillmentMode === 'delivery' && o.addressMode === 'different',
  )
  @IsString()
  @MinLength(5)
  deliveryAddress?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RentRequestItemDto)
  rentalItems: RentRequestItemDto[];

  @IsOptional()
  @IsString()
  customerMessage?: string;
}
