import { IsObject, IsOptional } from 'class-validator';

export class UpdateRentJourneyDataDto {
  @IsOptional()
  @IsObject()
  dynamicData?: Record<string, unknown>;
}
