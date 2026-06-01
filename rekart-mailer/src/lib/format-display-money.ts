/** Keeps currency code and amount on one line in narrow columns and email clients. */
export const CURRENCY_AMOUNT_SEP = "\u00a0";

function parseMoneyAmount(amount: number | string): number | null {
  const n =
    typeof amount === "number"
      ? amount
      : Number(String(amount ?? "").trim().replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function formatDisplayMoney(
  amount: number | string,
  currency: string | undefined,
): string {
  const n = parseMoneyAmount(amount);
  if (n === null) {
    const raw = String(amount ?? "").trim();
    if (!raw) return "—";
    const cur = (currency ?? "").trim();
    return cur ? `${cur}${CURRENCY_AMOUNT_SEP}${raw}` : raw;
  }

  const cur = (currency ?? "").trim();
  const formatted = n.toLocaleString(cur === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  if (cur === "INR") return `₹${formatted}`;
  if (cur === "USD") return `$${formatted}`;
  if (cur === "AED" || cur === "SAR") {
    return `${cur}${CURRENCY_AMOUNT_SEP}${formatted}`;
  }
  if (!cur) return formatted;
  return `${cur}${CURRENCY_AMOUNT_SEP}${formatted}`;
}

export function formatDisplayMoneyOrNull(
  amount: string | undefined,
  currency: string | undefined,
): string | null {
  const raw = String(amount ?? "").trim();
  if (!raw) return null;
  return formatDisplayMoney(raw, currency);
}
