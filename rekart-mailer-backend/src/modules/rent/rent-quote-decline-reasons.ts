/** Customer-facing decline reasons on rent quote / agreement. */
export const RENT_QUOTE_DECLINE_REASONS = [
  'Price is too high',
  'Need more time to decide',
  'Found another rental option',
  'Items not available as quoted',
  'Dates do not work for me',
  'Other',
] as const;

export type RentQuoteDeclineReason = (typeof RENT_QUOTE_DECLINE_REASONS)[number];

export const RENT_QUOTE_REVISE_TYPES = ['after_reason', 'final_offer'] as const;
export type RentQuoteReviseType = (typeof RENT_QUOTE_REVISE_TYPES)[number];

export function isValidRentQuoteDeclineReason(value: string): boolean {
  return value.trim().length >= 3;
}

export function isValidRentQuoteReviseType(
  value: string,
): value is RentQuoteReviseType {
  return (RENT_QUOTE_REVISE_TYPES as readonly string[]).includes(value);
}
