/** Props for money fields — text input preserves exact user typing (no browser .99 drift). */
export const MONEY_INPUT_PROPS = {
  type: "text" as const,
  inputMode: "decimal" as const,
};

/** Parse a money string for validation/totals only — does not mutate stored value. */
export function parseMoneyInput(raw: string | number | undefined | null): number {
  const s = String(raw ?? "").trim().replace(/[^\d.-]/g, "");
  if (!s || s === "-" || s === ".") return NaN;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function isValidMoneyInput(raw: string | number | undefined | null): boolean {
  return Number.isFinite(parseMoneyInput(raw));
}

/** Format a stored money value for display without changing digits the user entered. */
export function formatStoredMoney(raw: string | number | undefined | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s;
}
