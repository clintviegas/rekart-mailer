import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { SellWorkflowStatus } from '../schemas/sell-request.schema';

export class CreateSellRequestDto {
  @IsEmail({}, { message: 'customerEmail must be a valid email' })
  customerEmail: string;

  @IsEnum(SellWorkflowStatus)
  @IsOptional()
  workflowStatus?: SellWorkflowStatus;

  @IsObject()
  @IsOptional()
  dynamicFieldValues?: Record<string, unknown>;
}

export class UpdateSellRequestStatusDto {
  @IsEnum(SellWorkflowStatus)
  @IsNotEmpty()
  workflowStatus: SellWorkflowStatus;

  @IsObject()
  @IsOptional()
  dynamicFieldValues?: Record<string, unknown>;
}

export class LookupByRequestIdDto {
  @IsString()
  @IsNotEmpty()
  requestId: string;
}
