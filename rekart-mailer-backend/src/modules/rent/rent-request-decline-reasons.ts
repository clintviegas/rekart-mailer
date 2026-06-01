/** Customer-facing decline reasons on rent request. */
export const RENT_REQUEST_DECLINE_REASONS = [
  'Price is too high',
  'Need more time to decide',
  'Found another rental option',
  'Items not available as expected',
  'Changed my mind',
  'Other',
] as const;

export type RentRequestDeclineReason = (typeof RENT_REQUEST_DECLINE_REASONS)[number];

export function isValidRentRequestDeclineReason(value: string): boolean {
  return value.trim().length >= 3;
}
