import { formatDisplayMoney } from "@/lib/format-display-money";

export type RepairTemplateStatus = "draft" | "published" | "archived";

export interface RepairTemplate {
  _id: string;
  id: string;
  workspaceId: string;
  workflowKey: string;
  name: string;
  version: number;
  status: RepairTemplateStatus;
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

export interface CreateRepairTemplatePayload {
  workflowKey: string;
  name: string;
  subject: string;
  recipientEmail: string;
  dynamicFieldValues?: Record<string, unknown>;
  previewSnapshot?: Record<string, unknown>;
  htmlTemplate?: string;
}

// ── Delivery logs ─────────────────────────────────────────────────────────────
export type DeliveryStatus = "queued" | "processing" | "sent" | "failed" | "suppressed";

// ── Suppression ───────────────────────────────────────────────────────────────
export type SuppressionReason =
  | "unsubscribed"
  | "bounced"
  | "complaint"
  | "manual";

export interface RepairSuppression {
  _id: string;
  id: string;
  workspaceId: string;
  email: string;
  reason: SuppressionReason;
  source: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddSuppressionPayload {
  email: string;
  reason?: SuppressionReason;
  source?: string;
}

export interface RepairDeliveryLog {
  _id: string;
  id: string;
  workspaceId: string;
  templateId: string | null;
  workflowKey: string;
  recipientEmail: string;
  subject: string;
  provider: string | null;
  status: DeliveryStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  retryCount: number;
  sentAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dynamicFieldValues: Record<string, unknown>;
  suppressed: boolean;
  suppressionReason: string | null;
  trackingToken: string | null;
  opened: boolean;
  openCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  clicked: boolean;
  clickCount: number;
  firstClickedAt: string | null;
  lastClickedAt: string | null;
  clickedLinks: string[];
}

export interface RepairDeliveryLogDetail extends RepairDeliveryLog {
  timeline: Array<{ event: string; at: string | null }>;
  canResend: boolean;
}

export interface DeliveryLogFilters {
  status?: string;
  workflowKey?: string;
  provider?: string;
  recipientEmail?: string;
  requestId?: string;
  dateFrom?: string;
  dateTo?: string;
  opened?: string;
  clicked?: string;
  suppressed?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ResendResult {
  deliveryLogId: string;
  originalId?: string;
  status: DeliveryStatus;
  recipient: string;
}

export interface BulkResendResult {
  queued: number;
  total: number;
}

export interface ExportResult {
  csv: string;
  filename: string;
  count: number;
}

export interface AttachmentRef {
  storedFilename: string;
  originalName: string;
  mimeType: string;
  size?: number;
}

export interface EnqueueEmailPayload {
  templateId?: string;
  workflowKey: string;
  recipientEmail: string;
  subject: string;
  dynamicFieldValues?: Record<string, unknown>;
  attachments?: AttachmentRef[];
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}

export interface EnqueueEmailResult {
  jobId: string | undefined;
  deliveryLogId: string;
  status: DeliveryStatus;
  recipient: string;
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export interface RepairAnalyticsOverview {
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

export interface EngagementTrendItem {
  date: string;
  opens: number;
  clicks: number;
}

export interface WorkflowBreakdownItem {
  workflowKey: string;
  label: string;
  sent: number;
  failed: number;
  queued: number;
}

export interface DailyTrendItem {
  date: string;
  sent: number;
  failed: number;
}

export interface ProviderBreakdownItem {
  provider: string;
  sent: number;
  failed: number;
}

export interface UpdateRepairTemplatePayload {
  name?: string;
  subject?: string;
  recipientEmail?: string;
  dynamicFieldValues?: Record<string, unknown>;
  previewSnapshot?: Record<string, unknown>;
  htmlTemplate?: string;
}

// ── Request Journey ───────────────────────────────────────────────────────────

export type JourneyCurrency = "AED" | "INR" | "USD" | "SAR";
export type JourneyStatus =
  | "active"
  | "completed"
  | "cancelled"
  | "quote_declined"
  | "booking_declined"
  | "no_customer_action"
  | "device_return_requested";

export type RepairJourneyWorkflowStep =
  | "booking-confirmed"
  | "pickup-scheduled"
  | "device-received"
  | "diagnosing"
  | "quote-ready"
  | "repair-in-progress"
  | "device-ready"
  | "device-returned";

export type JourneyStepKey = RepairJourneyWorkflowStep;

export const REPAIR_JOURNEY_WORKFLOW_STEPS: RepairJourneyWorkflowStep[] = [
  "booking-confirmed",
  "pickup-scheduled",
  "device-received",
  "diagnosing",
  "quote-ready",
  "repair-in-progress",
  "device-ready",
  "device-returned",
];

export const REPAIR_JOURNEY_STEP_LABELS: Record<RepairJourneyWorkflowStep, string> = {
  "booking-confirmed": "Booking Confirmed",
  "pickup-scheduled": "Pickup Scheduled",
  "device-received": "Device Received",
  diagnosing: "Diagnosing",
  "quote-ready": "Quote Ready",
  "repair-in-progress": "Repair In Progress",
  "device-ready": "Device Ready",
  "device-returned": "Device Returned",
};

/** Extra workflow keys outside the main funnel (reminders). */
export const EXTRA_REPAIR_WORKFLOW_LABELS: Record<string, string> = {
  "booking-confirmed-reminder": "Booking Confirmed — Reminder",
  "pickup-scheduled-reminder": "Pickup Scheduled — Reminder",
  "quote-ready-reminder": "Quote Ready — Reminder",
  "device-ready-reminder": "Device Ready — Reminder",
  "device-return-unrepaired": "Device Return (No Repair)",
  "device-return-unrepaired-complete": "Device Return Complete",
  "courier-dispatched": "Courier Dispatched",
};

export function repairJourneyStepLabel(stepKey: string): string {
  return (
    REPAIR_JOURNEY_STEP_LABELS[stepKey as RepairJourneyWorkflowStep] ??
    EXTRA_REPAIR_WORKFLOW_LABELS[stepKey] ??
    stepKey
  );
}

export const JOURNEY_CURRENCIES: JourneyCurrency[] = ["AED", "INR", "USD", "SAR"];

export function formatJourneyCurrency(amount: number | string, currency: JourneyCurrency): string {
  return formatDisplayMoney(amount, currency);
}

export interface JourneySentStep {
  stepKey: RepairJourneyWorkflowStep | string;
  sentAt: string;
  deliveryLogId: string | null;
  deliveryStatus: DeliveryStatus;
  subject: string | null;
}

/** One stored outbound quote-ready email (for per-round preview). */
export interface RepairQuoteEmailLogItem {
  id: string;
  subject: string;
  status: DeliveryStatus;
  sentAt: string | null;
  createdAt: string;
  quoteGeneration: number | null;
}

export interface JourneyAttachment {
  storedFilename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: string;
}

export interface StaffNote {
  text: string;
  createdBy: string;
  createdAt: string;
}

export interface RepairRequestJourney {
  _id: string;
  id: string;
  workspaceId: string;
  requestId: string;
  customerEmail: string;
  customerName: string;
  currency: JourneyCurrency;
  currentStep: RepairJourneyWorkflowStep;
  completedSteps: JourneyStepKey[];
  dynamicData: Record<string, unknown>;
  sentSteps: JourneySentStep[];
  attachments: JourneyAttachment[];
  staffNotes: StaffNote[];
  status: JourneyStatus;
  /** Increments on each quote-ready send; used for signed accept/decline links. */
  quoteGeneration?: number;
  /** Increments on each booking-confirmed send; used for signed confirm/decline links. */
  bookingAckGeneration?: number;
  /** ISO datetime when the current quote expires — null means no expiry. */
  quoteExpiresAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJourneyPayload {
  customerEmail: string;
  customerName: string;
  currency?: JourneyCurrency;
  dynamicData?: Record<string, unknown>;
  attachments?: Array<{ storedFilename: string; originalName: string; mimeType: string; size: number; url: string }>;
}

export interface SendJourneyStepPayload {
  dynamicData?: Record<string, unknown>;
  subjectOverride?: string;
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}

/** Steps that can be previewed before a journey is created (server: PreviewJourneyDraftDto). */
export type PreviewJourneyDraftStep =
  | "booking-confirmed"
  | "pickup-scheduled"
  | "diagnosing";

export interface PreviewJourneyDraftPayload extends SendJourneyStepPayload {
  step: PreviewJourneyDraftStep;
  customerName: string;
  currency?: JourneyCurrency;
  requestId?: string;
}

// ── Customer Journey Actions ──────────────────────────────────────────────────

export type JourneyActionType =
  | "mail_opened"
  | "mail_clicked"
  | "track_clicked"
  | "reschedule_requested"
  | "quote_accepted"
  | "quote_declined"
  | "booking_confirmed_accepted"
  | "booking_confirmed_declined"
  | "receipt_viewed"
  | "rating_submitted"
  | "support_requested"
  | "return_device_requested"
  | "return_mode_store_selected"
  | "return_mode_courier_selected"
  /** Legacy sell action types still stored on old rows */
  | "offer_accepted"
  | "offer_declined"
  | "request_received_accepted"
  | "request_received_declined"
  | "journey_auto_closed";

export interface RepairJourneyAction {
  _id: string;
  workspaceId: string;
  requestId: string;
  journeyId: string;
  step: string;
  actionType: JourneyActionType;
  payload: Record<string, unknown>;
  ip: string;
  userAgent: string;
  createdAt: string;
}

export interface CustomerActionAlert {
  _id: string;
  actionType: JourneyActionType;
  step: string;
  requestId: string;
  journeyId: string;
  customerName: string;
  createdAt: string;
}

export interface StaffNotificationItem extends CustomerActionAlert {
  unread: boolean;
}

export interface StaffNotificationsPayload {
  items: StaffNotificationItem[];
  unreadCount: number;
  lastReadAt: string;
}

// ── Journey Analytics ─────────────────────────────────────────────────────────

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

export interface JourneyAnalytics {
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
}
