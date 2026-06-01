/** Customer-facing payment options when accepting a repair quote (collected at return). */
export const REPAIR_RETURN_PAYMENT_METHODS = [
  'Cash',
  'Online (UPI / Card)',
  'Bank Transfer',
  'Other',
] as const;

export type RepairReturnPaymentMethod =
  (typeof REPAIR_RETURN_PAYMENT_METHODS)[number];

export function isValidRepairReturnPaymentMethod(
  value: string,
): value is RepairReturnPaymentMethod {
  return (REPAIR_RETURN_PAYMENT_METHODS as readonly string[]).includes(value);
}
