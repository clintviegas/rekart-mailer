/** App-wide display format: DD/MM/YY */

function partsFromDate(d: Date): { day: string; month: string; year2: string } | null {
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: String(d.getMonth() + 1).padStart(2, "0"),
    year2: String(d.getFullYear()).slice(-2),
  };
}

/** ISO instant or Date → DD/MM/YY */
export function formatDateDDMMYY(input: string | Date | number | null | undefined): string {
  if (input == null || input === "") return "";
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return isoYmdToDisplay(input.trim());
  }
  const d = input instanceof Date ? input : new Date(input);
  const p = partsFromDate(d);
  if (!p) return "";
  return `${p.day}/${p.month}/${p.year2}`;
}

/** ISO instant or Date → DD/MM/YY, h:mm am/pm */
export function formatDateTimeDDMMYY(input: string | Date | number | null | undefined): string {
  if (input == null || input === "") return "";
  const d = input instanceof Date ? input : new Date(input);
  const datePart = formatDateDDMMYY(d);
  if (!datePart) return "";
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

/** HTML date input value (YYYY-MM-DD) → DD/MM/YY */
export function isoYmdToDisplay(isoYmd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoYmd)) return "";
  const [, y, m, d] = isoYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y.slice(-2)}`;
}

/** Chart label: MM/YY */
export function formatMonthYY(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const p = partsFromDate(d);
  if (!p) return "";
  return `${p.month}/${p.year2}`;
}

/** Parse DD/MM/YY, DD/MM/YYYY, DD-MM-YY, ISO YYYY-MM-DD, or Date.parse → YYYY-MM-DD */
export function parseDateToIsoYmd(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const dmY = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (dmY) {
    const day = Number(dmY[1]);
    const month = Number(dmY[2]);
    let year = Number(dmY[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** @deprecated Use isoYmdToDisplay — kept for journey email forms */
export const formatPickupDateForEmail = isoYmdToDisplay;

/** @deprecated Use parseDateToIsoYmd — kept for journey date inputs */
export const parsePickupDateToIso = parseDateToIsoYmd;

/** Email/UI field — ISO or parseable date → DD/MM/YY; keeps date+time strings intact */
export function displayDateValue(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s)) return s;
  const formatted = formatDateDDMMYY(s);
  return formatted || s;
}
