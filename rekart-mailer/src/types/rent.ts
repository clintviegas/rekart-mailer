export type RentTemplateStatus = "draft" | "published" | "archived";

export type RentDeliveryStatus =
  | "queued"
  | "processing"
  | "sent"
  | "failed"
  | "suppressed";

export type RentJourneyCurrency = "AED" | "INR" | "USD" | "SAR";

export type RentJourneyStatus = "active" | "completed" | "cancelled";

export type RentJourneyWorkflowStep =
  | "rent-request"
  | "rent-agreement"
  | "rent-ready-pickup"
  | "rent-dispatched"
  | "rent-handover"
  | "rent-return-reminder"
  | "rent-return-received"
  | "rent-closed";

export const RENT_JOURNEY_WORKFLOW_STEPS: RentJourneyWorkflowStep[] = [
  "rent-request",
  "rent-agreement",
  "rent-ready-pickup",
  "rent-dispatched",
  "rent-handover",
  "rent-return-reminder",
  "rent-return-received",
  "rent-closed",
];

export const RENT_JOURNEY_STEP_LABELS: Record<RentJourneyWorkflowStep, string> = {
  "rent-request": "Rent Request",
  "rent-agreement": "Quote & Agreement",
  "rent-ready-pickup": "Ready for Pickup",
  "rent-dispatched": "Dispatched",
  "rent-handover": "Handover",
  "rent-return-reminder": "Return Reminder",
  "rent-return-received": "Return Received",
  "rent-closed": "Closed",
};

export function rentStepLabel(stepKey: string): string {
  return (
    RENT_JOURNEY_STEP_LABELS[stepKey as RentJourneyWorkflowStep] ?? stepKey
  );
}

/** Branch steps skipped based on customer pickup/delivery choice. */
export function getRentBranchSkippedSteps(
  dynamicData?: Record<string, unknown>,
): Set<RentJourneyWorkflowStep> {
  const mode = String(dynamicData?.fulfillmentMode ?? "").toLowerCase();
  if (mode === "pickup") return new Set(["rent-dispatched"]);
  if (mode === "delivery") return new Set(["rent-ready-pickup"]);
  return new Set();
}

export function getApplicableRentSteps(
  dynamicData?: Record<string, unknown>,
): RentJourneyWorkflowStep[] {
  const skipped = getRentBranchSkippedSteps(dynamicData);
  return RENT_JOURNEY_WORKFLOW_STEPS.filter((s) => !skipped.has(s));
}

/** Customer declined the rent request email and staff must resend before quote. */
export function rentRequestDeclinedPendingResend(
  dynamicData?: Record<string, unknown>,
): boolean {
  return (
    dynamicData?.requestAckDeclined === true &&
    dynamicData?.requestAckByCustomer !== true
  );
}

/** Customer declined the quote/agreement and staff must resend a revised quote. */
export function rentAgreementDeclinedPendingResend(
  dynamicData?: Record<string, unknown>,
): boolean {
  if (!dynamicData) return false;
  if (isRentFinalOfferDeclinedClosed(dynamicData)) return false;
  if (isRentFinalOfferResumePending(dynamicData)) return false;
  const gen = Number(dynamicData.agreementGeneration ?? 0);
  const declinedGen = Number(dynamicData.agreementDeclinedGen ?? 0);
  const signedGen = Number(dynamicData.agreementSignedGen ?? 0);
  return (
    dynamicData.agreementDeclined === true &&
    gen > 0 &&
    declinedGen === gen &&
    signedGen !== gen
  );
}

/** Journey was auto-closed after customer declined a final offer email. */
export function isRentFinalOfferDeclinedClosed(
  dynamicData?: Record<string, unknown>,
): boolean {
  return dynamicData?.finalOfferDeclinedClosed === true;
}

/** Staff resumed a final-offer-closed journey — resend final offer only. */
export function isRentFinalOfferResumePending(
  dynamicData?: Record<string, unknown>,
): boolean {
  return dynamicData?.finalOfferResumePending === true;
}

export function isRentFinalOfferResumeLocked(
  dynamicData?: Record<string, unknown>,
): boolean {
  return dynamicData?.finalOfferResumeLocked === true;
}

/** Customer accepted the current quote (handles legacy sign before generation tracking). */
export function isRentAgreementAccepted(
  dynamicData?: Record<string, unknown> | null,
): boolean {
  if (!dynamicData || dynamicData.agreementSigned !== true) return false;
  if (rentAgreementDeclinedPendingResend(dynamicData)) return false;

  const gen = Number(dynamicData.agreementGeneration ?? 0);
  const signedGen = Number(dynamicData.agreementSignedGen ?? 0);

  if (gen > 0 && signedGen > 0) {
    return signedGen === gen;
  }

  // Legacy or sign before signedGen was persisted — trust agreementSigned flag
  return true;
}

export function resolveRentNextStep(
  journey: Pick<
    RentRequestJourney,
    "status" | "completedSteps" | "dynamicData"
  >,
): RentJourneyWorkflowStep | null {
  if (journey.status !== "active") return null;
  if (isRentFinalOfferResumePending(journey.dynamicData)) return null;
  if (rentRequestDeclinedPendingResend(journey.dynamicData)) return null;
  if (rentAgreementDeclinedPendingResend(journey.dynamicData)) return null;
  const applicable = getApplicableRentSteps(journey.dynamicData);
  return (
    applicable.find((s) => !journey.completedSteps.includes(s)) ?? null
  );
}

export const RENT_JOURNEY_CURRENCIES: RentJourneyCurrency[] = [
  "AED",
  "INR",
  "USD",
  "SAR",
];

export interface RentJourneySentStep {
  stepKey: string;
  sentAt: string;
  deliveryLogId: string | null;
  deliveryStatus: RentDeliveryStatus;
  subject: string | null;
}

export interface RentStepEmailLogItem {
  id: string;
  workflowKey: string;
  subject: string | null;
  status: RentDeliveryStatus | string;
  sentAt: string | null;
  createdAt: string | null;
}

export type RentJourneyActionType =
  | "track_clicked"
  | "request_pickup_chosen"
  | "request_delivery_chosen"
  | "request_confirmed"
  | "request_declined"
  | "agreement_signed"
  | "agreement_declined"
  | "support_requested";

export interface RentJourneyAction {
  _id: string;
  workspaceId: string;
  journeyId: string;
  requestId: string;
  action: RentJourneyActionType;
  stepKey: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface RentJourneyAttachment {
  storedFilename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: string;
}

/** Sidebar money highlight for quote / rental totals. */
export function getRentMoneyHighlight(
  dd: Record<string, unknown> | undefined | null,
): { label: string; amount: number; display: string } | null {
  if (!dd) return null;
  const raw = String(dd.rentalTotal ?? dd.rentalAmount ?? dd.grandTotal ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n) || n <= 0) return null;
  const signed = dd.agreementSigned === true;
  return { label: signed ? "Rental total" : "Quote total", amount: n, display: raw };
}

export interface RentRequestJourney {
  _id: string;
  id: string;
  workspaceId: string;
  requestId: string;
  customerEmail: string;
  customerName: string;
  currency: RentJourneyCurrency;
  currentStep: RentJourneyWorkflowStep | string;
  completedSteps: string[];
  dynamicData: Record<string, unknown>;
  sentSteps: RentJourneySentStep[];
  status: RentJourneyStatus;
  attachments: RentJourneyAttachment[];
  staffNotes: Array<{
    text: string;
    createdBy: string;
    createdAt: string;
  }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRentJourneyPayload {
  customerEmail: string;
  customerName: string;
  currency?: RentJourneyCurrency;
  dynamicData?: Record<string, unknown>;
  attachments?: Array<{
    storedFilename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
  }>;
}

export interface SendRentJourneyStepPayload {
  dynamicData?: Record<string, unknown>;
  subjectOverride?: string;
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}

export interface RentTemplate {
  _id: string;
  id: string;
  workspaceId: string;
  workflowKey: string;
  name: string;
  version: number;
  status: RentTemplateStatus;
  subject: string;
  recipientEmail: string;
  dynamicFieldValues: Record<string, unknown>;
  previewSnapshot: Record<string, unknown>;
  htmlTemplate: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRentTemplatePayload {
  workflowKey: string;
  name: string;
  subject: string;
  recipientEmail: string;
  dynamicFieldValues?: Record<string, unknown>;
  previewSnapshot?: Record<string, unknown>;
  htmlTemplate?: string;
}

export interface UpdateRentTemplatePayload {
  name?: string;
  subject?: string;
  recipientEmail?: string;
  dynamicFieldValues?: Record<string, unknown>;
  previewSnapshot?: Record<string, unknown>;
  htmlTemplate?: string;
}

/** One line item in a rent request (customer or admin). */
export interface RentItemLine {
  name: string;
  qty: number;
  /** Kept as string so staff-entered rates are not auto-rounded (e.g. 200 → 199.99). */
  rate: string;
}

export type RentFulfillmentMode = "pickup" | "delivery";

// ── Stats & analytics ───────────────────────────────────────────────────────

export interface RentReturnDueFollowUpItem extends RentRequestJourney {
  returnDueStatus?: string;
  returnDueLabel?: string;
  returnDueIso?: string;
  daysUntilDue?: number | null;
}

export interface RentStats {
  total: number;
  byStatus: {
    active: number;
    completed: number;
    cancelled: number;
  };
  byStep: Record<string, number>;
  byCurrentStep: Record<string, number>;
  byFulfillment: {
    pickup: number;
    delivery: number;
    pending: number;
  };
  totalRevenue: number;
  agreementSignedCount: number;
  agreementRate: number;
  recentJourneys: RentRequestJourney[];
  returnOverdueCount: number;
  returnDueTodayCount: number;
  returnDueSoonCount: number;
  returnDueFollowUpCount: number;
  returnAwaitingCount: number;
  returnDueFollowUp: RentReturnDueFollowUpItem[];
}

export interface RentAnalyticsOverview {
  totalSent: number;
  totalFailed: number;
  totalQueued: number;
  totalProcessing: number;
  totalSuppressed: number;
  deliveryRate: number | null;
  recentActivityCount: number;
  totalOpened: number;
  totalClicked: number;
  openRate: number | null;
  clickRate: number | null;
  ctr: number | null;
  totalUnsubscribed: number;
  totalSuppressedList: number;
}

export interface RentWorkflowBreakdownItem {
  workflowKey: string;
  label: string;
  sent: number;
  failed: number;
  queued: number;
}

export interface RentDailyTrendItem {
  date: string;
  sent: number;
  failed: number;
}

export interface RentEngagementTrendItem {
  date: string;
  opens: number;
  clicks: number;
}

export interface JourneyMonthlyTrendItem {
  month: string;
  requests: number;
  completions: number;
  revenue: number;
  cancellations: number;
}

export interface JourneyDailyTrendItem {
  date: string;
  day: string;
  requests: number;
}

export interface JourneyFunnelStep {
  step: string;
  label: string;
  count: number;
  dropOffRate: number;
  conversionRate: number;
}

export interface JourneyRevenueByCurrency {
  currency: string;
  total: number;
  count: number;
  avg: number;
}

export interface RentJourneyAnalytics {
  totalJourneys: number;
  thisMonthJourneys: number;
  lastMonthJourneys: number;
  growthRate: number | null;
  monthlyTrend: JourneyMonthlyTrendItem[];
  dailyTrend: JourneyDailyTrendItem[];
  funnel: JourneyFunnelStep[];
  actionCounts: Record<string, number>;
  revenueByCurrency: JourneyRevenueByCurrency[];
  avgCompletionHours: { avg: number; min: number; max: number } | null;
  byStatus: {
    active: number;
    completed: number;
    cancelled: number;
  };
  byFulfillment: {
    pickup: number;
    delivery: number;
    pending: number;
  };
  byCurrentStep: Record<string, number>;
  agreementSignedCount: number;
  handoverRate: number;
}

export type RentStaffAlertActionType =
  | "request_received_accepted"
  | "request_received_declined"
  | "agreement_signed"
  | "agreement_declined";

export interface RentStaffNotificationItem {
  _id: string;
  actionType: RentStaffAlertActionType;
  step: string;
  requestId: string;
  journeyId: string;
  customerName: string;
  createdAt: string;
  unread: boolean;
  metadata?: Record<string, unknown>;
}

export interface RentStaffNotificationsPayload {
  items: RentStaffNotificationItem[];
  unreadCount: number;
  lastReadAt: string;
}

export interface RentItemChangeSet {
  added: RentItemLine[];
  removed: RentItemLine[];
  qtyChanged: Array<{ name: string; from: number; to: number }>;
}
