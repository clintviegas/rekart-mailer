/** Trimmed string from dynamicData (journey) field. */
function s(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

export type JourneyMoneyDisplay =
  | { kind: "single"; raw: string }
  | { kind: "range"; minRaw: string; maxRaw: string };

/**
 * Amount to show in list/overview/detail when paid/final offer is absent.
 * Supports legacy `estimatedPrice` and new `estimatedPriceMin` / `estimatedPriceMax`.
 */
export function getJourneyEstimatedMoneyDisplay(
  dd: Record<string, unknown> | undefined | null,
): JourneyMoneyDisplay | null {
  const paid = s(dd?.paidAmount);
  const fin = s(dd?.finalOffer);
  if (paid || fin) return null;

  const min = s(dd?.estimatedPriceMin);
  const max = s(dd?.estimatedPriceMax);
  const leg = s(dd?.estimatedPrice);

  if (min && max) return { kind: "range", minRaw: min, maxRaw: max };
  if (leg) return { kind: "single", raw: leg };
  if (min) return { kind: "single", raw: min };
  if (max) return { kind: "single", raw: max };
  return null;
}

export function formatJourneyMoneyDisplay(
  currencyPrefix: string,
  d: JourneyMoneyDisplay,
): string {
  const sp = currencyPrefix.trim() ? `${currencyPrefix.trim()} ` : "";
  if (d.kind === "single") return `${sp}${d.raw}`;
  return `${sp}${d.minRaw} – ${d.maxRaw}`;
}

/** Sidebar / detail highlight: paid → final offer → estimated (single or range). */
export function getJourneyMoneyHighlight(
  dd: Record<string, unknown> | undefined | null,
): { label: "Paid" | "Offer" | "Estimated"; display: JourneyMoneyDisplay } | null {
  const paid = s(dd?.paidAmount);
  const fin = s(dd?.finalOffer);
  if (paid) return { label: "Paid", display: { kind: "single", raw: paid } };
  if (fin) return { label: "Offer", display: { kind: "single", raw: fin } };
  const min = s(dd?.estimatedPriceMin);
  const max = s(dd?.estimatedPriceMax);
  const leg = s(dd?.estimatedPrice);
  if (min && max) return { label: "Estimated", display: { kind: "range", minRaw: min, maxRaw: max } };
  if (leg) return { label: "Estimated", display: { kind: "single", raw: leg } };
  if (min) return { label: "Estimated", display: { kind: "single", raw: min } };
  if (max) return { label: "Estimated", display: { kind: "single", raw: max } };
  return null;
}
