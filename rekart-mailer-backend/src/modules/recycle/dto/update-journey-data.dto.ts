import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsObject,
  IsArray,
  MaxLength,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class RecycleItemLineDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() qty?: number | string;
}

class RecycleBulkCategoryLineDto {
  @IsString() @MaxLength(200) category: string;
  @IsOptional() qty?: number | string;
}

/**
 * Whitelist of allowed top-level keys for PATCH /:id/data.
 * Prevents clients from writing arbitrary keys to dynamicData.
 */
const ALLOWED_DYNAMIC_KEYS = [
  'deviceName',
  'deviceModel',
  'deviceBrand',
  'deviceCondition',
  'condition',
  'storage',
  'storageCapacity',
  'requestDate',
  'estimatedPrice',
  'estimatedPriceMin',
  'estimatedPriceMax',
  'estimatedValue',
  'estimatedValueMin',
  'estimatedValueMax',
  'finalOffer',
  'offerAmount',
  'paidAmount',
  'paymentAmount',
  'paymentMethod',
  'payoutMethod',
  'paymentReference',
  'transactionId',
  'bankNote',
  'accountDetails',
  'paymentDate',
  'pickupDate',
  'pickupTime',
  'pickupTimeSlot',
  'customerPreferredPickupTimeSlot',
  'customerPreferredPickupTimeAny',
  'customerPreferredPickupDate',
  'pickupAddress',
  'pickupNote',
  'agentContact',
  'offerValidUntil',
  'offerExpiryHours',
  'currency',
  'courierName',
  'trackingNumber',
  'trackingUrl',
  'inspectionNotes',
  'inspectorName',
  'inspectionStartTime',
  'inspectionStartDate',
  'estimatedCompletion',
  'finalAmount',
  'completionDate',
  'staffNote',
  'customMessage',
  'customMessages',
  'agentName',
  'agentPhone',
  'closedByReship',
  'quoteLineItems',
  'quoteDiscounts',
  'recycleSummary',
  'quoteAmount',
  'technicianName',
  'diagnosisCenter',
  'estimatedDiagnosisDate',
  'receivedBy',
  'receivedAt',
  'issueDescription',
  'estimatedCompletionDate',
  'recycleNotes',
  'returnedDate',
  'closingMessage',
  'readyDate',
  'collectionAddress',
  'collectionHours',
  'quoteDeclineReason',
  'quoteDeclinedAt',
  'quoteReviseType',
  'returnDeviceRequested',
  'returnDeviceRequestedAt',
  'returnMethod',
  'returnMode',
  'returnModeSelectedAt',
  'deliveryAddress',
  'expectedReturnDate',
  'courierDispatchedAt',
  'closedByDeviceReturn',
  'collectionMode',
  'recycleItems',
  'recycleItemsSummary',
  'bulkEstimate',
  'bulkDescription',
  'bulkCategories',
  'collectionNotes',
  'collectedDate',
  'collectedBy',
  'actualTotalQty',
  'actualItemsSummary',
  'certificateNumber',
  'certificateIssuedDate',
  'certificateUrl',
] as const;

export type AllowedDynamicKey = (typeof ALLOWED_DYNAMIC_KEYS)[number];

export class UpdateJourneyDataDto {
  @IsOptional() @IsString() @MaxLength(200) deviceName?: string;
  @IsOptional() @IsString() @MaxLength(200) deviceModel?: string;
  @IsOptional() @IsString() @MaxLength(100) deviceBrand?: string;
  @IsOptional() @IsString() @MaxLength(100) deviceCondition?: string;
  @IsOptional() @IsString() @MaxLength(100) condition?: string;
  @IsOptional() @IsString() @MaxLength(100) storage?: string;
  @IsOptional() @IsString() @MaxLength(100) storageCapacity?: string;
  @IsOptional() @IsString() @MaxLength(100) requestDate?: string;
  @IsOptional() @IsString() @MaxLength(50)  estimatedPrice?: string;
  @IsOptional() @IsString() @MaxLength(50)  estimatedPriceMin?: string;
  @IsOptional() @IsString() @MaxLength(50)  estimatedPriceMax?: string;
  @IsOptional() @IsString() @MaxLength(50)  estimatedValue?: string;
  @IsOptional() @IsString() @MaxLength(50)  estimatedValueMin?: string;
  @IsOptional() @IsString() @MaxLength(50)  estimatedValueMax?: string;
  @IsOptional() @IsString() @MaxLength(50)  finalOffer?: string;
  @IsOptional() @IsString() @MaxLength(50)  offerAmount?: string;
  @IsOptional() @IsString() @MaxLength(50)  paidAmount?: string;
  @IsOptional() @IsString() @MaxLength(50)  paymentAmount?: string;
  @IsOptional() @IsString() @MaxLength(100) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(100) payoutMethod?: string;
  @IsOptional() @IsString() @MaxLength(200) paymentReference?: string;
  @IsOptional() @IsString() @MaxLength(200) transactionId?: string;
  @IsOptional() @IsString() @MaxLength(500) bankNote?: string;
  @IsOptional() @IsString() @MaxLength(500) accountDetails?: string;
  @IsOptional() @IsString() @MaxLength(100) paymentDate?: string;
  @IsOptional() @IsString() @MaxLength(100) pickupDate?: string;
  @IsOptional() @IsString() @MaxLength(100) pickupTime?: string;
  @IsOptional() @IsString() @MaxLength(100) pickupTimeSlot?: string;
  @IsOptional() @IsString() @MaxLength(100) customerPreferredPickupTimeSlot?: string;
  @IsOptional() @IsBoolean() customerPreferredPickupTimeAny?: boolean;
  @IsOptional() @IsString() @MaxLength(20) customerPreferredPickupDate?: string;
  @IsOptional() @IsString() @MaxLength(500) pickupAddress?: string;
  @IsOptional() @IsString() @MaxLength(500) pickupNote?: string;
  @IsOptional() @IsString() @MaxLength(100) agentContact?: string;
  @IsOptional() @IsString() @MaxLength(100) offerValidUntil?: string;
  @IsOptional() @IsString() @MaxLength(10)  offerExpiryHours?: string;
  @IsOptional() @IsString() @MaxLength(20)  currency?: string;
  @IsOptional() @IsString() @MaxLength(200) courierName?: string;
  @IsOptional() @IsString() @MaxLength(200) trackingNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) trackingUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) inspectionNotes?: string;
  @IsOptional() @IsString() @MaxLength(200)  inspectorName?: string;
  @IsOptional() @IsString() @MaxLength(100)  inspectionStartTime?: string;
  @IsOptional() @IsString() @MaxLength(100)  inspectionStartDate?: string;
  @IsOptional() @IsString() @MaxLength(200)  estimatedCompletion?: string;
  @IsOptional() @IsString() @MaxLength(50)   finalAmount?: string;
  @IsOptional() @IsString() @MaxLength(100)  completionDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) staffNote?: string;
  @IsOptional() @IsString() @MaxLength(1000) customMessage?: string;
  @IsOptional() @IsObject()                  customMessages?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(200)  agentName?: string;
  @IsOptional() @IsString() @MaxLength(50)   agentPhone?: string;
  @IsOptional() @IsBoolean()                 closedByReship?: boolean;
  @IsOptional() @IsString() @MaxLength(8000) quoteLineItems?: string;
  @IsOptional() @IsString() @MaxLength(4000) quoteDiscounts?: string;
  @IsOptional() @IsString() @MaxLength(2000) RecycleSummary?: string;
  @IsOptional() @IsString() @MaxLength(50)   quoteAmount?: string;
  @IsOptional() @IsString() @MaxLength(200)  technicianName?: string;
  @IsOptional() @IsString() @MaxLength(200)  diagnosisCenter?: string;
  @IsOptional() @IsString() @MaxLength(200)  estimatedDiagnosisDate?: string;
  @IsOptional() @IsString() @MaxLength(200)  receivedBy?: string;
  @IsOptional() @IsString() @MaxLength(200)  receivedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) issueDescription?: string;
  @IsOptional() @IsString() @MaxLength(100)  estimatedCompletionDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) RecycleNotes?: string;
  @IsOptional() @IsString() @MaxLength(100)  returnedDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) closingMessage?: string;
  @IsOptional() @IsString() @MaxLength(100)  readyDate?: string;
  @IsOptional() @IsString() @MaxLength(500)  collectionAddress?: string;
  @IsOptional() @IsString() @MaxLength(100)  collectionHours?: string;
  @IsOptional() @IsString() @MaxLength(100)  preferredPaymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(100)  paymentMethodUpdatedAt?: string;
  @IsOptional() @IsString() @MaxLength(500)  quoteDeclineReason?: string;
  @IsOptional() @IsString() @MaxLength(100)  quoteDeclinedAt?: string;
  @IsOptional() @IsString() @MaxLength(50)   quoteReviseType?: string;
  @IsOptional() @IsBoolean()                 returnDeviceRequested?: boolean;
  @IsOptional() @IsString() @MaxLength(100)  returnDeviceRequestedAt?: string;
  @IsOptional() @IsString() @MaxLength(200)  returnMethod?: string;
  @IsOptional() @IsString() @MaxLength(20)   returnMode?: string;
  @IsOptional() @IsString() @MaxLength(100)  returnModeSelectedAt?: string;
  @IsOptional() @IsString() @MaxLength(500)  deliveryAddress?: string;
  @IsOptional() @IsString() @MaxLength(100)  expectedReturnDate?: string;
  @IsOptional() @IsString() @MaxLength(100)  courierDispatchedAt?: string;
  @IsOptional() @IsBoolean()                 closedByDeviceReturn?: boolean;

  @IsOptional() @IsIn(['listed', 'bulk_estimate']) collectionMode?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RecycleItemLineDto) recycleItems?: RecycleItemLineDto[];
  @IsOptional() @IsString() @MaxLength(2000) recycleItemsSummary?: string;
  @IsOptional() @IsIn(['1-5', '6-20', '21-50', '50+', 'unknown']) bulkEstimate?: string;
  @IsOptional() @IsString() @MaxLength(2000) bulkDescription?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RecycleBulkCategoryLineDto) bulkCategories?: RecycleBulkCategoryLineDto[];
  @IsOptional() @IsString() @MaxLength(1000) collectionNotes?: string;
  @IsOptional() @IsString() @MaxLength(100) collectedDate?: string;
  @IsOptional() @IsString() @MaxLength(200) collectedBy?: string;
  @IsOptional() @IsString() @MaxLength(50) actualTotalQty?: string;
  @IsOptional() @IsString() @MaxLength(2000) actualItemsSummary?: string;
  @IsOptional() @IsString() @MaxLength(200) certificateNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) certificateIssuedDate?: string;
  @IsOptional() @IsString() @MaxLength(500) certificateUrl?: string;
}
