/** Standard device condition presets + “Other” (custom detail). Used in create journey + request-received form. */
export const SELL_CONDITION_OPTIONS = [
  { value: "Excellent", label: "Excellent — Like new, no scratches" },
  { value: "Good", label: "Good — Minor scratches, fully functional" },
  { value: "Fair", label: "Fair — Visible wear, fully functional" },
  { value: "Poor", label: "Poor — Heavy wear or minor defects" },
  { value: "Damaged", label: "Damaged — Screen cracked / not working" },
  { value: "Other", label: "Other — describe below" },
] as const;

const STANDARD_NO_OTHER = SELL_CONDITION_OPTIONS.filter((o) => o.value !== "Other").map(
  (o) => o.value,
);

/** Single field stored on journey as `deviceCondition` (and sent in emails). */
export function formatDeviceCondition(select: string, otherDetail: string): string {
  const s = select.trim();
  const d = otherDetail.trim();
  if (s === "Other") return d ? `Other — ${d}` : "Other";
  return s;
}

/** Split stored value back into select + optional “Other” text. */
export function parseDeviceCondition(stored: string): { select: string; other: string } {
  const t = (stored ?? "").trim();
  if (!t) return { select: "", other: "" };
  if ((STANDARD_NO_OTHER as readonly string[]).includes(t)) return { select: t, other: "" };
  const m = t.match(/^Other\s*[—:]\s*(.*)$/i);
  if (m) return { select: "Other", other: m[1].trim() };
  if (/^other$/i.test(t)) return { select: "Other", other: "" };
  return { select: "Other", other: t };
}
