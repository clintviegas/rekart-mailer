/** App-wide display format: DD/MM/YY */

function partsFromDate(d: Date): { day: string; month: string; year2: string } | null {
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    year2: String(d.getFullYear()).slice(-2),
  };
}

export function formatDateDDMMYY(input: string | Date | null | undefined): string {
  if (input == null || input === '') return '';
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return isoYmdToDisplay(input.trim());
  }
  const d = input instanceof Date ? input : new Date(input);
  const p = partsFromDate(d);
  if (!p) return '';
  return `${p.day}/${p.month}/${p.year2}`;
}

export function formatDateTimeDDMMYY(input: string | Date | null | undefined): string {
  if (input == null || input === '') return '';
  const d = input instanceof Date ? input : new Date(input);
  const datePart = formatDateDDMMYY(d);
  if (!datePart) return '';
  const timePart = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export function isoYmdToDisplay(isoYmd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoYmd)) return '';
  const [, y, m, d] = isoYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y.slice(-2)}`;
}

export function formatMonthYY(d: Date): string {
  const p = partsFromDate(d);
  if (!p) return '';
  return `${p.month}/${p.year2}`;
}

export function parseDateToIsoYmd(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const dmY = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (dmY) {
    const day = Number(dmY[1]);
    const month = Number(dmY[2]);
    let year = Number(dmY[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Email/UI field — ISO or parseable date → DD/MM/YY; keeps date+time strings intact */
export function displayDateValue(raw: string | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s)) return s;
  const formatted = formatDateDDMMYY(s);
  return formatted || s;
}

/** Strip legacy "Store:" prefix from pick-up / collection addresses. */
export function normalizePickUpAddress(raw: string | undefined | null): string {
  return String(raw ?? '').trim().replace(/^Store:\s*/i, '');
}

/** Customer pickup date from HTML date input (YYYY-MM-DD), today or future. */
export function isValidCustomerPreferredPickupDate(isoYmd: string): boolean {
  const t = isoYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const iso = parseDateToIsoYmd(t);
  if (iso !== t) return false;
  const [y, m, d] = t.split('-').map(Number);
  const picked = new Date(y, m - 1, d);
  if (
    picked.getFullYear() !== y ||
    picked.getMonth() !== m - 1 ||
    picked.getDate() !== d
  ) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  picked.setHours(0, 0, 0, 0);
  return picked >= today;
}
