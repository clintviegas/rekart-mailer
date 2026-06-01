/** Customer-facing decline reasons on Recycle quote. */
export const Recycle_QUOTE_DECLINE_REASONS = [
  'Price is too high',
  'Need more time to decide',
  'Found another Recycle service',
  "Don't want to proceed with Recycle",
  'Other',
] as const;

export type RecycleQuoteDeclineReason = (typeof Recycle_QUOTE_DECLINE_REASONS)[number];

export const Recycle_QUOTE_REVISE_TYPES = ['after_reason', 'final_offer'] as const;
export type RecycleQuoteReviseType = (typeof Recycle_QUOTE_REVISE_TYPES)[number];

export function isValidQuoteDeclineReason(value: string): boolean {
  return value.trim().length >= 3;
}

export function isValidQuoteReviseType(value: string): value is RecycleQuoteReviseType {
  return (Recycle_QUOTE_REVISE_TYPES as readonly string[]).includes(value);
}
