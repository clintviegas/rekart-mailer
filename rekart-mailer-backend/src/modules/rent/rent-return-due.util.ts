import { parseDateToIsoYmd } from '../../common/date-format';
import { RentJourneyStatus } from './schemas/rent-request-journey.schema';

export type RentReturnDueStatus =
  | 'none'
  | 'upcoming'
  | 'due_soon'
  | 'due_today'
  | 'overdue'
  | 'returned';

export const RENT_RETURN_DUE_SOON_DAYS = 7;

export interface RentReturnDueSummary {
  status: RentReturnDueStatus;
  iso: string;
  label: string;
  daysUntilDue: number | null;
  awaitingReturn: boolean;
  followUp: boolean;
}

type JourneyLike = {
  status?: string;
  completedSteps?: string[];
  dynamicData?: Record<string, unknown>;
};

export function resolveRentReturnDueRaw(
  dynamicData?: Record<string, unknown>,
): string {
  const dd = dynamicData ?? {};
  const storedIso = String(dd['returnDueDateIso'] ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(storedIso)) return storedIso;
  const raw = String(dd['returnDueDate'] ?? dd['rentalEndDate'] ?? '').trim();
  if (!raw) return '';
  return parseDateToIsoYmd(raw);
}

export function startOfLocalDay(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

export function daysBetweenCalendarDates(from: Date, to: Date): number {
  const ms = startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function isRentAwaitingReturn(journey: JourneyLike): boolean {
  if (journey.status !== RentJourneyStatus.ACTIVE) return false;
  const steps = journey.completedSteps ?? [];
  if (!steps.includes('rent-handover')) return false;
  if (steps.includes('rent-return-received')) return false;
  return true;
}

/** Active rental out with customer and a known return due date. */
export function isRentReturnDueListItem(journey: JourneyLike): boolean {
  if (!isRentAwaitingReturn(journey)) return false;
  return !!resolveRentReturnDueRaw(journey.dynamicData);
}

export function compareRentReturnDueAsc(
  a: JourneyLike,
  b: JourneyLike,
  now = new Date(),
): number {
  const sa = getRentReturnDueSummary(a, now);
  const sb = getRentReturnDueSummary(b, now);
  const da = sa.daysUntilDue ?? 999_999;
  const db = sb.daysUntilDue ?? 999_999;
  if (da !== db) return da - db;
  return sa.iso.localeCompare(sb.iso);
}

export function getRentReturnDueSummary(
  journey: JourneyLike,
  now = new Date(),
): RentReturnDueSummary {
  const steps = journey.completedSteps ?? [];
  if (
    journey.status === RentJourneyStatus.COMPLETED ||
    steps.includes('rent-return-received')
  ) {
    return {
      status: 'returned',
      iso: resolveRentReturnDueRaw(journey.dynamicData),
      label: '',
      daysUntilDue: null,
      awaitingReturn: false,
      followUp: false,
    };
  }

  const iso = resolveRentReturnDueRaw(journey.dynamicData);
  if (!iso) {
    return {
      status: 'none',
      iso: '',
      label: '',
      daysUntilDue: null,
      awaitingReturn: isRentAwaitingReturn(journey),
      followUp: false,
    };
  }

  const [y, m, d] = iso.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const daysUntilDue = daysBetweenCalendarDates(now, due);
  const awaitingReturn = isRentAwaitingReturn(journey);

  let status: RentReturnDueStatus = 'upcoming';
  if (daysUntilDue < 0) status = 'overdue';
  else if (daysUntilDue === 0) status = 'due_today';
  else if (daysUntilDue <= RENT_RETURN_DUE_SOON_DAYS) status = 'due_soon';

  const label = formatRentReturnDueLabel(iso, daysUntilDue);
  const followUp =
    awaitingReturn &&
    (status === 'overdue' || status === 'due_today' || status === 'due_soon');

  return {
    status,
    iso,
    label,
    daysUntilDue,
    awaitingReturn,
    followUp,
  };
}

export function formatRentReturnDueLabel(
  iso: string,
  daysUntilDue: number | null,
): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const display = `${d}/${m}/${y.slice(-2)}`;
  if (daysUntilDue == null) return display;
  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return `${display} (${overdueDays}d overdue)`;
  }
  if (daysUntilDue === 0) return `${display} (today)`;
  if (daysUntilDue === 1) return `${display} (tomorrow)`;
  if (daysUntilDue <= RENT_RETURN_DUE_SOON_DAYS) {
    return `${display} (in ${daysUntilDue}d)`;
  }
  return display;
}

/** Keep normalized ISO on dynamicData for list filters and stats. */
export function applyRentReturnDueFields(
  dynamicData: Record<string, unknown>,
): Record<string, unknown> {
  const iso = resolveRentReturnDueRaw(dynamicData);
  if (!iso) {
    const next = { ...dynamicData };
    delete next['returnDueDateIso'];
    return next;
  }
  return { ...dynamicData, returnDueDateIso: iso };
}

export function journeyMatchesReturnDueFilter(
  journey: JourneyLike,
  filter: 'follow_up' | 'overdue' | 'all_due',
  now = new Date(),
): boolean {
  const summary = getRentReturnDueSummary(journey, now);
  if (!summary.iso) return false;

  switch (filter) {
    case 'overdue':
      return summary.awaitingReturn && summary.status === 'overdue';
    case 'follow_up':
      return summary.followUp;
    case 'all_due':
      return (
        summary.awaitingReturn &&
        (summary.status === 'overdue' ||
          summary.status === 'due_today' ||
          summary.status === 'due_soon')
      );
    default:
      return false;
  }
}
