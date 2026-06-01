/** Customer-facing payment options when accepting a Recycle quote (collected at return). */
export const Recycle_RETURN_PAYMENT_METHODS = [
  'Cash',
  'Online (UPI / Card)',
  'Bank Transfer',
  'Other',
] as const;

export type RecycleReturnPaymentMethod =
  (typeof Recycle_RETURN_PAYMENT_METHODS)[number];

export function isValidRecycleReturnPaymentMethod(
  value: string,
): value is RecycleReturnPaymentMethod {
  return (Recycle_RETURN_PAYMENT_METHODS as readonly string[]).includes(value);
}
