import { formatDisplayMoney } from "@/lib/format-display-money";

export type SellTemplateStatus = "draft" | "published" | "archived";

export interface SellTemplate {
  _id: string;
  id: string;
  workspaceId: string;
  workflowKey: string;
  name: string;
  version: number;
  status: SellTemplateStatus;
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

export interface CreateSellTemplatePayload {
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

export interface SellSuppression {
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

export interface SellDeliveryLog {
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
  // Suppression
  suppressed: boolean;
  suppressionReason: string | null;
  // Tracking
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

export interface SellDeliveryLogDetail extends SellDeliveryLog {
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
export interface SellAnalyticsOverview {
  totalSent: number;
  totalFailed: number;
  totalQueued: number;
  totalProcessing: number;
  totalSuppressed: number;
  deliveryRate: number | null;
  recentActivityCount: number;
  // Engagement
  totalOpened: number;
  totalClicked: number;
  openRate: number | null;
  clickRate: number | null;
  ctr: number | null;
  // Compliance
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

export interface UpdateSellTemplatePayload {
  name?: string;
  subject?: string;
  recipientEmail?: string;
  dynamicFieldValues?: Record<string, unknown>;
  previewSnapshot?: Record<string, unknown>;
  htmlTemplate?: string;
}

// ── Request Journey ───────────────────────────────────────────────────────────

export type JourneyCurrency = "AED" | "INR" | "USD" | "SAR";
export type JourneyStatus   = "active" | "completed" | "cancelled" | "offer_declined" | "request_declined" | "no_customer_action";
export type JourneyWorkflowStep =
  | "request-received"
  | "pickup-scheduled"
  | "inspection-underway"
  | "offer-ready"
  | "payment-sent"
  | "completed";

/** Emails outside the main 6-step funnel (e.g. return shipment). */
export const DEVICE_RESHIP_STEP = "device-reship" as const;
export type JourneyStepKey = JourneyWorkflowStep | typeof DEVICE_RESHIP_STEP;

export const JOURNEY_WORKFLOW_STEPS: JourneyWorkflowStep[] = [
  "request-received",
  "pickup-scheduled",
  "inspection-underway",
  "offer-ready",
  "payment-sent",
  "completed",
];

export const JOURNEY_STEP_LABELS: Record<JourneyWorkflowStep, string> = {
  "request-received":    "Request Received",
  "pickup-scheduled":    "Pickup Scheduled",
  "inspection-underway": "Inspection Underway",
  "offer-ready":         "Offer Ready",
  "payment-sent":        "Payment Sent",
  "completed":           "Completed",
};

/** Extra workflow keys outside the 6-step funnel (reminders + reship). */
export const EXTRA_WORKFLOW_LABELS: Record<string, string> = {
  "device-reship":              "Return Shipment",
  "request-received-reminder":  "Request Received — Reminder",
  "pickup-scheduled-reminder":  "Pickup Scheduled — Reminder",
  "offer-ready-reminder":       "Offer Ready — Reminder",
};

/** Labels for steps not in the main workflow list (used in timeline / preview). */
export function journeyStepLabel(stepKey: string): string {
  if (stepKey === DEVICE_RESHIP_STEP) return "Return shipment";
  return (
    JOURNEY_STEP_LABELS[stepKey as JourneyWorkflowStep] ??
    EXTRA_WORKFLOW_LABELS[stepKey] ??
    stepKey
  );
}

export const JOURNEY_CURRENCIES: JourneyCurrency[] = ["AED", "INR", "USD", "SAR"];

export function formatJourneyCurrency(amount: number | string, currency: JourneyCurrency): string {
  return formatDisplayMoney(amount, currency);
}

export interface JourneySentStep {
  stepKey:        JourneyWorkflowStep | typeof DEVICE_RESHIP_STEP | string;
  sentAt:         string;
  deliveryLogId:  string | null;
  deliveryStatus: DeliveryStatus;
  subject:        string | null;
}

/** One stored outbound offer-ready email (for per-round preview). */
export interface SellOfferEmailLogItem {
  id: string;
  subject: string;
  status: DeliveryStatus;
  sentAt: string | null;
  createdAt: string;
  offerGeneration: number | null;
}

export interface JourneyAttachment {
  storedFilename: string;
  originalName:   string;
  mimeType:       string;
  size:           number;
  url:            string;
  uploadedAt:     string;
}

export interface StaffNote {
  text:      string;
  createdBy: string;
  createdAt: string;
}

export interface SellRequestJourney {
  _id:            string;
  id:             string;
  workspaceId:    string;
  requestId:      string;
  customerEmail:  string;
  customerName:   string;
  currency:       JourneyCurrency;
  currentStep:    JourneyWorkflowStep | typeof DEVICE_RESHIP_STEP;
  completedSteps: JourneyStepKey[];
  dynamicData:    Record<string, unknown>;
  sentSteps:      JourneySentStep[];
  attachments:    JourneyAttachment[];
  staffNotes:     StaffNote[];
  status:         JourneyStatus;
  /** Increments on each offer-ready send; used for signed accept/decline links. */
  offerGeneration?: number;
  /** Increments on each request-received send; used for signed confirm/decline links. */
  requestAckGeneration?: number;
  /** ISO datetime when the current offer expires — null means no expiry. */
  offerExpiresAt?: string | null;
  createdBy:      string;
  createdAt:      string;
  updatedAt:      string;
}

export interface CreateJourneyPayload {
  customerEmail: string;
  customerName:  string;
  currency?:     JourneyCurrency;
  dynamicData?:  Record<string, unknown>;
  attachments?:  Array<{ storedFilename: string; originalName: string; mimeType: string; size: number; url: string }>;
}

export interface SendJourneyStepPayload {
  dynamicData?:        Record<string, unknown>;
  subjectOverride?:    string;
  customSignoffName?:  string;
  customFooterNote?:   string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?:  string;
}

/** Steps that can be previewed before a journey is created (server: PreviewJourneyDraftDto). */
export type PreviewJourneyDraftStep =
  | 'request-received'
  | 'pickup-scheduled'
  | 'inspection-underway';

export interface PreviewJourneyDraftPayload extends SendJourneyStepPayload {
  step: PreviewJourneyDraftStep;
  customerName: string;
  currency?: JourneyCurrency;
  requestId?: string;
}

// ── Customer Journey Actions ──────────────────────────────────────────────────

export type JourneyActionType =
  | 'mail_opened'
  | 'mail_clicked'
  | 'track_clicked'
  | 'reschedule_requested'
  | 'offer_accepted'
  | 'offer_declined'
  | 'request_received_accepted'
  | 'request_received_declined'
  | 'receipt_viewed'
  | 'rating_submitted'
  | 'support_requested'
  | 'journey_auto_closed';

export interface SellJourneyAction {
  _id:        string;
  workspaceId: string;
  requestId:  string;
  journeyId:  string;
  step:       string;
  actionType: JourneyActionType;
  payload:    Record<string, unknown>;
  ip:         string;
  userAgent:  string;
  createdAt:  string;
}

/** Enriched journey action row for staff UI (email link activity). */
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
  month:         string;
  requests:      number;
  completions:   number;
  revenue:       number;
  cancellations: number;
}

export interface JourneyDailyTrendItem {
  date:     string;
  day:      string;
  requests: number;
}

export interface JourneyFunnelStep {
  step:           string;
  label:          string;
  count:          number;
  dropOffRate:    number;
  conversionRate: number;
}

export interface JourneyRevenueByCurrency {
  currency: string;
  total:    number;
  count:    number;
  avg:      number;
}

export interface JourneyAnalytics {
  totalJourneys:      number;
  thisMonthJourneys:  number;
  lastMonthJourneys:  number;
  growthRate:         number | null;
  monthlyTrend:       JourneyMonthlyTrendItem[];
  dailyTrend:         JourneyDailyTrendItem[];
  funnel:             JourneyFunnelStep[];
  actionCounts:       Record<string, number>;
  revenueByCurrency:  JourneyRevenueByCurrency[];
  avgCompletionHours: { avg: number; min: number; max: number } | null;
}
