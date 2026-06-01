export const REPAIR_PICKUP_TIME_WINDOWS = [
  "9:00 AM – 12:00 PM",
  "12:00 PM – 3:00 PM",
  "3:00 PM – 6:00 PM",
  "6:00 PM – 9:00 PM",
] as const;

export const REPAIR_PICKUP_TIME_ANY = "Any time";

export const REPAIR_PICKUP_TIME_WINDOW_SELECT_OPTIONS = [
  ...REPAIR_PICKUP_TIME_WINDOWS,
  REPAIR_PICKUP_TIME_ANY,
] as const;

export type RepairPickupTimeWindowOption =
  (typeof REPAIR_PICKUP_TIME_WINDOW_SELECT_OPTIONS)[number];

export function isRepairPickupTimeAny(value: string | undefined | null): boolean {
  return String(value ?? "").trim().toLowerCase() === "any time";
}

export function isValidRepairPickupTimeWindowSelection(value: string): boolean {
  const v = value.trim();
  return REPAIR_PICKUP_TIME_WINDOW_SELECT_OPTIONS.some((opt) => opt === v);
}

function parse12hTokenToHm(token: string): string | null {
  const m = token.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = m[2];
  const ap = m[3].toUpperCase();
  if (Number.isNaN(h)) return null;
  if (h === 12) h = ap === "AM" ? 0 : 12;
  else if (ap === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${mi}`;
}

/** Map a customer-facing slot label to 24h `HH:mm` inputs for the staff pickup form. */
export function parseRepairPickupTimeWindowToHm(
  label: string,
): { from: string; to: string } | null {
  if (isRepairPickupTimeAny(label)) return null;
  const parts = label.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return null;
  const from = parse12hTokenToHm(parts[0]);
  const to = parse12hTokenToHm(parts[1]);
  if (!from || !to) return null;
  return { from, to };
}

export function readCustomerPreferredPickupTimeSlot(
  dynamicData: Record<string, unknown> | undefined,
): string {
  const raw = dynamicData?.customerPreferredPickupTimeSlot;
  return raw != null ? String(raw).trim() : "";
}

/** Normalise stored customer pickup date to YYYY-MM-DD for admin date inputs. */
export function readCustomerPreferredPickupDate(
  dynamicData: Record<string, unknown> | undefined,
): string {
  const raw = dynamicData?.customerPreferredPickupDate;
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (!dmY) return "";
  const day = Number(dmY[1]);
  const month = Number(dmY[2]);
  let year = Number(dmY[3]);
  if (year < 100) year += year < 50 ? 2000 : 1900;
  if (day < 1 || day > 31 || month < 1 || month > 12) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayIsoYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
