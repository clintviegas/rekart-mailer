import { parseDateToIsoYmd, formatDateDDMMYY } from "@/lib/date-format";
import type { RentRequestJourney } from "@/types/rent";

export type RentReturnDueStatus =
  | "none"
  | "upcoming"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "returned";

export const RENT_RETURN_DUE_SOON_DAYS = 7;

export interface RentReturnDueInfo {
  status: RentReturnDueStatus;
  iso: string;
  label: string;
  daysUntilDue: number | null;
  awaitingReturn: boolean;
  followUp: boolean;
}

type JourneyLike = Pick<RentRequestJourney, "status" | "completedSteps" | "dynamicData">;

function startOfLocalDay(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

function daysBetweenCalendarDates(from: Date, to: Date): number {
  const ms = startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function resolveRentReturnDueRaw(
  dynamicData?: Record<string, unknown>,
): string {
  const dd = dynamicData ?? {};
  const storedIso = String(dd.returnDueDateIso ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(storedIso)) return storedIso;
  const raw = String(dd.returnDueDate ?? dd.rentalEndDate ?? "").trim();
  if (!raw) return "";
  return parseDateToIsoYmd(raw);
}

export function isRentAwaitingReturn(journey: JourneyLike): boolean {
  if (journey.status !== "active") return false;
  const steps = journey.completedSteps ?? [];
  if (!steps.includes("rent-handover")) return false;
  if (steps.includes("rent-return-received")) return false;
  return true;
}

export function formatRentReturnDueLabel(
  iso: string,
  daysUntilDue: number | null,
): string {
  if (!iso) return "";
  const display = formatDateDDMMYY(iso) || iso;
  if (daysUntilDue == null) return display;
  if (daysUntilDue < 0) {
    return `${display} (${Math.abs(daysUntilDue)}d overdue)`;
  }
  if (daysUntilDue === 0) return `${display} (today)`;
  if (daysUntilDue === 1) return `${display} (tomorrow)`;
  if (daysUntilDue <= RENT_RETURN_DUE_SOON_DAYS) {
    return `${display} (in ${daysUntilDue}d)`;
  }
  return display;
}

export function getRentReturnDueInfo(
  journey: JourneyLike,
  now = new Date(),
): RentReturnDueInfo {
  const steps = journey.completedSteps ?? [];
  if (journey.status === "completed" || steps.includes("rent-return-received")) {
    return {
      status: "returned",
      iso: resolveRentReturnDueRaw(journey.dynamicData),
      label: "",
      daysUntilDue: null,
      awaitingReturn: false,
      followUp: false,
    };
  }

  const iso = resolveRentReturnDueRaw(journey.dynamicData);
  if (!iso) {
    return {
      status: "none",
      iso: "",
      label: "",
      daysUntilDue: null,
      awaitingReturn: isRentAwaitingReturn(journey),
      followUp: false,
    };
  }

  const [y, m, d] = iso.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const daysUntilDue = daysBetweenCalendarDates(now, due);
  const awaitingReturn = isRentAwaitingReturn(journey);

  let status: RentReturnDueStatus = "upcoming";
  if (daysUntilDue < 0) status = "overdue";
  else if (daysUntilDue === 0) status = "due_today";
  else if (daysUntilDue <= RENT_RETURN_DUE_SOON_DAYS) status = "due_soon";

  return {
    status,
    iso,
    label: formatRentReturnDueLabel(iso, daysUntilDue),
    daysUntilDue,
    awaitingReturn,
    followUp:
      awaitingReturn &&
      (status === "overdue" || status === "due_today" || status === "due_soon"),
  };
}

export function rentReturnDueBadgeClass(status: RentReturnDueStatus): string {
  switch (status) {
    case "overdue":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300";
    case "due_today":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
    case "due_soon":
      return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200";
    case "upcoming":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function rentReturnDueBadgeLabel(status: RentReturnDueStatus): string {
  switch (status) {
    case "overdue":
      return "Overdue";
    case "due_today":
      return "Due today";
    case "due_soon":
      return "Due soon";
    case "upcoming":
      return "Scheduled";
    default:
      return "";
  }
}

export function compareRentReturnDueAsc(
  a: JourneyLike,
  b: JourneyLike,
  now = new Date(),
): number {
  const sa = getRentReturnDueInfo(a, now);
  const sb = getRentReturnDueInfo(b, now);
  const da = sa.daysUntilDue ?? 999_999;
  const db = sb.daysUntilDue ?? 999_999;
  if (da !== db) return da - db;
  return sa.iso.localeCompare(sb.iso);
}

export function sortRentJourneysByReturnDueAsc<T extends JourneyLike>(
  journeys: T[],
  now = new Date(),
): T[] {
  return [...journeys].sort((a, b) => compareRentReturnDueAsc(a, b, now));
}
