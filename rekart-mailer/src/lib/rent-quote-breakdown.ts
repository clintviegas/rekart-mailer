import { formatDisplayMoney } from "@/lib/format-display-money";
import { parseMoneyInput } from "@/lib/money-input";

export interface RentQuoteLine {
  name: string;
  qty: number;
  rate: number;
  lineTotal: number;
}

export interface RentQuoteDiscount {
  description: string;
  amount: number;
}

export interface RentQuoteBreakdown {
  lines: RentQuoteLine[];
  discounts: RentQuoteDiscount[];
  subtotal: number;
  discountTotal: number;
  total: number;
}

function parseAmount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = parseMoneyInput(String(raw ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseRentQuoteDiscounts(raw: unknown): RentQuoteDiscount[] {
  if (raw == null || raw === "") return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const description = String(r.description ?? r.label ?? r.name ?? "").trim();
        const amount = parseAmount(r.amount ?? r.discount);
        if (!description || amount <= 0) return null;
        return { description, amount };
      })
      .filter((x): x is RentQuoteDiscount => x != null);
  } catch {
    return [];
  }
}

export function parseRentQuoteLines(
  items: Array<{ name: string; qty: number; rate?: number | string }> | undefined,
): RentQuoteLine[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, i) => {
      const name = String(item.name ?? "").trim();
      if (!name) return null;
      const qty = Math.max(1, Math.round(Number(item.qty) || 1));
      const rate = parseAmount(item.rate);
      return { name, qty, rate, lineTotal: qty * rate };
    })
    .filter((x): x is RentQuoteLine => x != null);
}

export function buildRentQuoteBreakdown(
  items: Array<{ name: string; qty: number; rate?: number | string }> | undefined,
  quoteDiscountsRaw: unknown,
  rentalAmountRaw?: string,
): RentQuoteBreakdown {
  const lines = parseRentQuoteLines(items);
  const discounts = parseRentQuoteDiscounts(quoteDiscountsRaw);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const computedTotal = Math.max(0, subtotal - discountTotal);
  const rentalAmount = parseAmount(rentalAmountRaw);
  const total = rentalAmount > 0 ? rentalAmount : computedTotal;

  return { lines, discounts, subtotal, discountTotal, total };
}

export function formatRentQuoteMoney(amount: number, currency: string | undefined): string {
  return formatDisplayMoney(amount, currency);
}
