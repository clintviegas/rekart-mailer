/** Customer-facing decline reasons on repair quote. */
export const REPAIR_QUOTE_DECLINE_REASONS = [
  'Price is too high',
  'Need more time to decide',
  'Found another repair service',
  "Don't want to proceed with repair",
  'Other',
] as const;

export type RepairQuoteDeclineReason = (typeof REPAIR_QUOTE_DECLINE_REASONS)[number];

export const REPAIR_QUOTE_REVISE_TYPES = ['after_reason', 'final_offer'] as const;
export type RepairQuoteReviseType = (typeof REPAIR_QUOTE_REVISE_TYPES)[number];

export function isValidQuoteDeclineReason(value: string): boolean {
  return value.trim().length >= 3;
}

export function isValidQuoteReviseType(value: string): value is RepairQuoteReviseType {
  return (REPAIR_QUOTE_REVISE_TYPES as readonly string[]).includes(value);
}
