/** Keeps currency code and amount on one line in narrow columns and email clients. */
export const CURRENCY_AMOUNT_SEP = '\u00a0';

export const MONEY_CELL_NOWRAP = 'white-space:nowrap;word-break:keep-all;';

export function formatDisplayMoney(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  switch (currency) {
    case 'INR':
      return `₹${formatted}`;
    case 'USD':
      return `$${formatted}`;
    case 'AED':
    case 'SAR':
      return `${currency}${CURRENCY_AMOUNT_SEP}${formatted}`;
    default:
      return currency
        ? `${currency}${CURRENCY_AMOUNT_SEP}${formatted}`
        : formatted;
  }
}

export function formatCurrency(
  amount: number | string,
  currency: string,
): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) {
    return `${currency}${CURRENCY_AMOUNT_SEP}${amount}`;
  }
  return formatDisplayMoney(n, currency);
}
