/** Payment modes staff record when customer pays at pickup / delivery handover. */
export const RENT_HANDOVER_PAYMENT_METHODS = [
  "Cash",
  "Card",
  "Online (UPI / Card)",
  "Bank Transfer",
  "Other",
] as const;

export type RentHandoverPaymentMethod = (typeof RENT_HANDOVER_PAYMENT_METHODS)[number];

export function formatRentPaymentMethodLabel(raw: unknown): string {
  return String(raw ?? "").trim();
}
