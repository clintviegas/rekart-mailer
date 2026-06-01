"use client";

import { useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, RotateCcw, Loader2, CheckCircle2,
  AlertCircle, Wallet,
  BadgeCheck, RefreshCw, ChevronRight,
  Activity, CalendarPlus, Search, Send,
  BanknoteIcon, XCircle,
  ChevronDown, ChevronUp, Pencil, Check, X, Paperclip, Eye,
  Calendar,
  Package, StickyNote, Trash2, Plus, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MONEY_INPUT_PROPS } from "@/lib/money-input";
import {
  formatDateDDMMYY,
  formatDateTimeDDMMYY,
  formatPickupDateForEmail,
  parsePickupDateToIso,
} from "@/lib/date-format";
import { toast } from "sonner";
import {
  useJourney,
  useSendJourneyStep,
  useResendJourneyStep,
  useJourneyActions,
  useCancelJourney,
  useDeclineOffer,
  useUpdateJourneyData,
  usePreviewJourneyEmail,
  useSendDeviceReship,
  useOfferEmailLogs,
} from "@/hooks/use-sell-templates";
import { sellService } from "@/services/sell.service";
import {
  JOURNEY_WORKFLOW_STEPS,
  JOURNEY_STEP_LABELS,
  DEVICE_RESHIP_STEP,
  journeyStepLabel,
  type JourneyWorkflowStep,
  type SellRequestJourney,
  type JourneyCurrency,
  type JourneyStatus,
  type SellJourneyAction,
  type JourneyActionType,
  type JourneyAttachment,
  type SellOfferEmailLogItem,
  type StaffNote,
} from "@/types/sell";
import {
  SELL_CONDITION_OPTIONS,
  formatDeviceCondition,
  parseDeviceCondition,
} from "@/constants/sell-device";
import {
  SELL_EMAIL_PREVIEW_DIALOG_CLASS,
  SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS,
  SELL_EMAIL_PREVIEW_IFRAME_CLASS,
} from "@/constants/sell-email-preview";
import {
  formatJourneyMoneyDisplay,
  getJourneyMoneyHighlight,
} from "@/lib/sell-estimated-price";
import {
  isRepairPickupTimeAny,
  parseRepairPickupTimeWindowToHm,
  readCustomerPreferredPickupTimeSlot,
  readCustomerPreferredPickupDate,
} from "@/lib/repair-pickup-time-windows";

function deliveryLogPreviewKey(logId: string) {
  return `dl:${logId}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<JourneyCurrency, string> = {
  AED: "AED", INR: "₹", USD: "$", SAR: "SAR",
};

function formatRelativeExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ── State machine definition ──────────────────────────────────────────────────

interface NextAction {
  label: string;
  description: string;
  nextStep: JourneyWorkflowStep;
  Icon: React.FC<{ className?: string }>;
  variant: "primary" | "success";
}

// Before the first email is sent, currentStep stays "request-received" but completedSteps
// does not yet include it — use this action instead of NEXT_ACTION["request-received"].
const SEND_REQUEST_EMAIL_ACTION: NextAction = {
  label:       "Send Request Received Email",
  description: "Send the initial confirmation email to the customer",
  nextStep:    "request-received",
  Icon:        Send,
  variant:     "primary",
};

// Each entry matches journey.currentStep: nextStep is the EMAIL to send now,
// not the following stage. Backend advances currentStep after each successful send.
const NEXT_ACTION: Partial<Record<JourneyWorkflowStep, NextAction>> = {
  "request-received": {
    label:       "Schedule Pickup",
    description: "Send pickup schedule details to the customer",
    nextStep:    "pickup-scheduled",
    Icon:        CalendarPlus,
    variant:     "primary",
  },
  "pickup-scheduled": {
    label:       "Schedule Pickup",
    description: "Send pickup schedule details to the customer",
    nextStep:    "pickup-scheduled",
    Icon:        CalendarPlus,
    variant:     "primary",
  },
  "inspection-underway": {
    label:       "Start Inspection",
    description: "Notify customer that device inspection has begun",
    nextStep:    "inspection-underway",
    Icon:        Search,
    variant:     "primary",
  },
  "offer-ready": {
    label:       "Send Offer",
    description: "Enter the final offer amount and send to customer",
    nextStep:    "offer-ready",
    Icon:        Wallet,
    variant:     "primary",
  },
  "payment-sent": {
    label:       "Mark Payment Sent",
    description: "Enter payment details and confirm to customer",
    nextStep:    "payment-sent",
    Icon:        BanknoteIcon,
    variant:     "success",
  },
  "completed": {
    label:       "Complete Journey",
    description: "Mark this sell journey as successfully completed",
    nextStep:    "completed",
    Icon:        BadgeCheck,
    variant:     "success",
  },
};

/** Dynamic fields we surface elsewhere (sidebar) or are internal flags — omit from generic list. */
const HIDDEN_JOURNEY_DYNAMIC_KEYS = new Set([
  "deviceName",
  "reshipCourier",
  "reshipTracking",
  "reshipTrackingUrl",
  "reshipSentAt",
  "closedByReship",
  "reshipMessage",
  "offerRoundHistory",
  "offerAcceptedByCustomer",
  "offerAcceptedAt",
  "offerAcceptedGeneration",
  "requestAckByCustomer",
  "requestAckAcceptedGen",
  "requestAckAcceptedAt",
  "requestAckDeclined",
  "requestAckDeclinedGen",
  "requestAckDeclinedAt",
  "requestAckGeneration",
  "offerGeneration",
]);

/** Matches backend offer generation (incl. legacy journeys with offer sent but no counter). */
function offerEffectiveGen(j: SellRequestJourney): number {
  const og = j.offerGeneration;
  if (typeof og === "number" && og > 0) return og;
  if (j.completedSteps.includes("offer-ready")) return 1;
  return 0;
}

/** True when customer accepted the current offer round (same generation as latest email). */
function customerAcceptedCurrentOffer(j: SellRequestJourney): boolean {
  const dd = j.dynamicData as Record<string, unknown> | undefined;
  if (!dd || dd.offerAcceptedByCustomer !== true) return false;
  const gen = offerEffectiveGen(j);
  if (gen <= 0) return false;
  const ag = dd.offerAcceptedGeneration;
  if (typeof ag === "number" && ag > 0) return ag === gen;
  return gen === 1;
}

function requestAckEffectiveGen(j: SellRequestJourney): number {
  const g = j.requestAckGeneration;
  return typeof g === "number" && g > 0 ? g : 0;
}

/** True when customer confirmed the current Request Received email (signed-link generation). */
function customerAcknowledgedCurrentRequest(j: SellRequestJourney): boolean {
  const dd = j.dynamicData as Record<string, unknown> | undefined;
  if (!dd || dd.requestAckByCustomer !== true) return false;
  const gen = requestAckEffectiveGen(j);
  if (gen <= 0) return false;
  const ag = dd.requestAckAcceptedGen;
  return typeof ag === "number" && ag > 0 && ag === gen;
}

function OfferRoundHistoryList({
  journey,
  journeyActions,
  onPreviewDeliveryLog,
  previewBusyKey,
}: {
  journey: SellRequestJourney;
  journeyActions: SellJourneyAction[];
  onPreviewDeliveryLog?: (logId: string) => void;
  previewBusyKey?: string | null;
}) {
  type Line = {
    at: number;
    text: string;
    sortKey: string;
    deliveryLogId?: string;
    kind?: string;
  };
  const lines: Line[] = [];
  const hist = (journey.dynamicData as Record<string, unknown> | undefined)?.offerRoundHistory;
  if (Array.isArray(hist) && hist.length > 0) {
    let i = 0;
    for (const e of hist) {
      i += 1;
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      const kind = String(o.kind ?? "");
      const atStr = String(o.at ?? o.sentAt ?? "");
      const gen = typeof o.generation === "number" ? o.generation : undefined;
      const dl =
        typeof o.deliveryLogId === "string" && o.deliveryLogId.trim() !== ""
          ? o.deliveryLogId.trim()
          : undefined;
      const t = atStr ? new Date(atStr).getTime() : NaN;
      if (!Number.isFinite(t)) continue;
      let text = "";
      if (kind === "email_sent") text = `Offer email sent${gen != null ? ` · round ${gen}` : ""}`;
      else if (kind === "customer_accepted") text = `Customer accepted${gen != null ? ` · round ${gen}` : ""}`;
      else if (kind === "customer_declined") text = `Customer declined${gen != null ? ` · round ${gen}` : ""}`;
      else text = kind ? kind.replace(/_/g, " ") : "Event";
      lines.push({ at: t, text, sortKey: `${t}-${i}`, deliveryLogId: dl, kind });
    }
  }
  else {
    let i = 0;
    for (const a of journeyActions) {
      if (a.step !== "offer-ready") continue;
      if (a.actionType !== "offer_accepted" && a.actionType !== "offer_declined") continue;
      i += 1;
      const t = new Date(a.createdAt).getTime();
      const gen = (a.payload as Record<string, unknown> | undefined)?.offerGeneration;
      const g = typeof gen === "number" ? gen : undefined;
      const text =
        a.actionType === "offer_accepted"
          ? `Customer accepted${g != null ? ` · round ${g}` : ""}`
          : `Customer declined${g != null ? ` · round ${g}` : ""}`;
      lines.push({ at: t, text, sortKey: `${t}-a-${i}` });
    }
  }
  lines.sort((a, b) => a.at - b.at);
  if (lines.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 border-t border-border/40 pt-2 pl-1">
      {lines.map((l) => (
        <li key={l.sortKey} className="text-[10px] text-muted-foreground flex gap-2 items-center justify-between">
          <div className="flex gap-2 min-w-0">
            <span className="shrink-0 tabular-nums opacity-80">
              {formatDateTimeDDMMYY(l.at)}
            </span>
            <span className="font-medium text-foreground/90">{l.text}</span>
          </div>
          {l.kind === "email_sent" && l.deliveryLogId && onPreviewDeliveryLog ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-primary shadow-none focus-visible:ring-0 focus-visible:border-transparent"
              title="Preview this sent email"
              disabled={!!previewBusyKey && previewBusyKey === deliveryLogPreviewKey(l.deliveryLogId)}
              onClick={() => { onPreviewDeliveryLog(l.deliveryLogId!); }}
            >
              {previewBusyKey === deliveryLogPreviewKey(l.deliveryLogId)
                ? <Loader2 className="size-3 animate-spin" />
                : <Eye className="size-3" />}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function OfferEmailSendsBlock({
  journeyId,
  onPreviewDeliveryLog,
  previewBusyKey,
}: {
  journeyId: string;
  onPreviewDeliveryLog: (logId: string) => void;
  previewBusyKey: string | null;
}) {
  const { data, isLoading } = useOfferEmailLogs(journeyId);
  const logs: SellOfferEmailLogItem[] = data?.logs ?? [];
  if (isLoading && logs.length === 0) {
    return (
      <p className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> Loading offer email history…
      </p>
    );
  }
  if (logs.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border/40 pt-2 space-y-1">
      <p className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wide">
        Each offer email ({logs.length})
      </p>
      <p className="text-[9px] text-muted-foreground leading-snug">
        Preview matches what was sent for that round (stored delivery log).
      </p>
      <ul className="space-y-1">
        {logs.map((log, idx) => {
          const k = deliveryLogPreviewKey(log.id);
          const busy = previewBusyKey === k;
          const when = log.sentAt ?? log.createdAt;
          return (
            <li
              key={log.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/10 px-2 py-1"
            >
              <div className="min-w-0">
                <span className="text-[10px] font-medium text-foreground">
                  #{idx + 1}
                  {log.offerGeneration != null ? ` (round ${log.offerGeneration})` : ""}
                </span>
                <span className="text-[9px] text-muted-foreground tabular-nums ml-1.5">
                  {when
                    ? formatDateTimeDDMMYY(when)
                    : ""}
                </span>
                <span className="sr-only">{log.status}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2 text-[10px] font-normal text-muted-foreground hover:text-foreground shadow-none focus-visible:ring-0 focus-visible:border-transparent"
                title="Preview email"
                disabled={busy}
                onClick={() => { onPreviewDeliveryLog(log.id); }}
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Eye className="size-3" />}
                Preview
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const RESEND_ALLOWED: Set<JourneyWorkflowStep> = new Set([
  "request-received",
  "pickup-scheduled",
  "inspection-underway",
  "offer-ready",
  "payment-sent",
]);

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<JourneyStatus, { label: string; className: string; dot: string }> = {
  active:        { label: "Active",         className: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",       dot: "bg-blue-500" },
  completed:     { label: "Completed",      className: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800", dot: "bg-emerald-500" },
  cancelled:     { label: "Cancelled",      className: "bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700", dot: "bg-slate-400" },
  offer_declined:{ label: "Offer Declined", className: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",             dot: "bg-red-500" },
  request_declined: { label: "Request Declined", className: "bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-950/35 dark:text-orange-300 dark:border-orange-800", dot: "bg-orange-500" },
  no_customer_action: { label: "No Response", className: "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700", dot: "bg-slate-400" },
};

function StatusBadge({ status, closedByReship }: { status: JourneyStatus; closedByReship?: boolean }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  const label =
    status === "completed" && closedByReship ? "Completed · Return shipment" : c.label;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", c.className)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {label}
    </span>
  );
}

// ── Customer activity feed ────────────────────────────────────────────────────

const ACTION_META: Record<JourneyActionType, { icon: string; label: string; color: string }> = {
  mail_opened:          { icon: "📬", label: "Email Opened",         color: "text-blue-700 dark:text-blue-300" },
  mail_clicked:         { icon: "🖱️",  label: "Link Clicked",        color: "text-blue-700 dark:text-blue-300" },
  track_clicked:        { icon: "📍", label: "Tracked Request",      color: "text-violet-700 dark:text-violet-300" },
  reschedule_requested: { icon: "📅", label: "Reschedule Requested", color: "text-amber-700 dark:text-amber-300" },
  offer_accepted:       { icon: "✅", label: "Offer Accepted",       color: "text-emerald-700 dark:text-emerald-300" },
  offer_declined:       { icon: "❌", label: "Offer Declined",       color: "text-red-700 dark:text-red-300" },
  request_received_accepted: { icon: "✅", label: "Request Confirmed", color: "text-emerald-700 dark:text-emerald-300" },
  request_received_declined: { icon: "✖️", label: "Request Declined (email)", color: "text-orange-700 dark:text-orange-300" },
  receipt_viewed:       { icon: "🧾", label: "Receipt Viewed",       color: "text-teal-700 dark:text-teal-300" },
  rating_submitted:     { icon: "⭐", label: "Rating Submitted",     color: "text-amber-700 dark:text-amber-300" },
  support_requested:    { icon: "💬", label: "Support Requested",    color: "text-indigo-700 dark:text-indigo-300" },
  journey_auto_closed:  { icon: "⏱️", label: "Auto-closed (no response)", color: "text-slate-600 dark:text-slate-400" },
};

const STEP_SHORT: Record<string, string> = {
  "request-received":    "Request",
  "pickup-scheduled":    "Pickup",
  "inspection-underway": "Inspection",
  "offer-ready":         "Offer",
  "payment-sent":        "Payment",
  "completed":           "Completed",
};

function ActivityFeed({ journeyId }: { journeyId: string }) {
  const { data: actions, isLoading } = useJourneyActions(journeyId);
  if (isLoading) return (
    <p className="text-xs text-muted-foreground py-3 text-center">Loading…</p>
  );
  if (!actions?.length) return (
    <p className="text-xs text-muted-foreground py-3 text-center">
      No customer interactions yet. Actions appear here when customers click email buttons.
    </p>
  );
  return (
    <div className="space-y-1.5">
      {actions.map((a: SellJourneyAction) => {
        const m = ACTION_META[a.actionType] ?? { icon: "•", label: a.actionType, color: "text-muted-foreground" };
        const rating = a.actionType === "rating_submitted" && a.payload?.rating
          ? `${"★".repeat(Number(a.payload.rating))}${"☆".repeat(5 - Number(a.payload.rating))}`
          : null;
        return (
          <div key={a._id} className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
            <span className="mt-0.5 text-sm shrink-0">{m.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("font-semibold", m.color)}>{m.label}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDateTimeDDMMYY(a.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground">{STEP_SHORT[a.step] ?? a.step}</span>
                {rating && <span className="text-amber-500 text-[11px]">{rating}</span>}
                {!!a.payload?.feedback && (
                  <span className="text-[10px] italic text-muted-foreground truncate max-w-[200px]">"{String(a.payload.feedback)}"</span>
                )}
                {!!a.payload?.preferredDate && (
                  <span className="text-[10px] text-muted-foreground">
                    → {String(a.payload.preferredDate)}
                    {a.payload.preferredTime ? ` at ${String(a.payload.preferredTime)}` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────

function EditableField({
  label, value, fieldKey, journeyId, disabled,
}: {
  label: string; value: string; fieldKey: string; journeyId: string; disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const { mutate, isPending }  = useUpdateJourneyData();

  function save() {
    if (draft.trim() === value) { setEditing(false); return; }
    mutate(
      { id: journeyId, data: { [fieldKey]: draft.trim() } },
      { onSettled: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 col-span-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="flex-1 rounded border border-primary/40 bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button type="button" onClick={save} disabled={isPending} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded p-1 text-muted-foreground hover:bg-muted">
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="py-1.5 border-b border-border/50 last:border-0 group space-y-0.5">
      <span className="block text-[11px] leading-snug text-muted-foreground break-words">{label}</span>
      <div className="flex items-start gap-1">
        <span className="flex-1 text-[12px] font-medium leading-snug text-foreground break-words whitespace-normal">
          {value || "—"}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => { setDraft(value); setEditing(true); }}
            className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-primary transition-opacity"
          >
            <Pencil className="size-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Journey timeline ──────────────────────────────────────────────────────────

/** Green tick only when an email was actually sent (or legacy completedSteps), never fake payment/completed on reship closes. */
function journeyTimelineStepSent(journey: SellRequestJourney, stepKey: JourneyWorkflowStep): boolean {
  const closedByReship = journey.dynamicData?.closedByReship === true;
  const hasSent = journey.sentSteps?.some((s) => s.stepKey === stepKey) ?? false;
  const inCompleted = journey.completedSteps.includes(stepKey);
  return (
    hasSent ||
    (inCompleted && !(closedByReship && (stepKey === "payment-sent" || stepKey === "completed")))
  );
}

function TimelineStep({
  stepKey,
  idx,
  journey,
  journeyActions = [],
  deviceReshipRowFollows,
  onPreviewSentStep,
  previewStepLoading,
  onPreviewDeliveryLog,
}: {
  stepKey: JourneyWorkflowStep;
  idx: number;
  journey: SellRequestJourney;
  journeyActions?: SellJourneyAction[];
  /** When true, the “completed” row keeps a connector down to the device-reship row */
  deviceReshipRowFollows: boolean;
  onPreviewSentStep?: (step: string) => void;
  /** Step key (e.g. `offer-ready`) or `dl:&lt;logId&gt;` while a delivery-log preview loads */
  previewStepLoading?: string | null;
  /** Re-render HTML from a stored offer delivery log */
  onPreviewDeliveryLog?: (logId: string) => void;
}) {
  const sent       = journeyTimelineStepSent(journey, stepKey);
  const offerDeclined = journey.status === "offer_declined";
  const requestDeclined = journey.status === "request_declined";
  const requestAckGen = requestAckEffectiveGen(journey);
  let current      = journey.currentStep === stepKey && !sent;
  if (offerDeclined && (stepKey === "payment-sent" || stepKey === "completed")) {
    current = false;
  }
  if (
    stepKey === "payment-sent" &&
    journey.status === "active" &&
    !customerAcceptedCurrentOffer(journey) &&
    !sent
  ) {
    current = false;
  }
  const needsOfferRevision = offerDeclined && stepKey === "offer-ready" && sent;
  const needsRequestRevision = requestDeclined && stepKey === "request-received" && sent;
  const awaitingOfferResponse =
    stepKey === "offer-ready" &&
    sent &&
    journey.status === "active" &&
    !offerDeclined &&
    !customerAcceptedCurrentOffer(journey);
  const awaitingRequestAck =
    stepKey === "request-received" &&
    sent &&
    journey.status === "active" &&
    requestAckGen > 0 &&
    !customerAcknowledgedCurrentRequest(journey);
  const requestAckDone =
    stepKey === "request-received" &&
    sent &&
    requestAckGen > 0 &&
    customerAcknowledgedCurrentRequest(journey);
  const customerPreferredPickupSlot = readCustomerPreferredPickupTimeSlot(
    journey.dynamicData as Record<string, unknown> | undefined,
  );
  const customerPreferredPickupDate = readCustomerPreferredPickupDate(
    journey.dynamicData as Record<string, unknown> | undefined,
  );
  const future     = !sent && !current;
  const record = journey.sentSteps?.find((s) => s.stepKey === stepKey);
  /** Offer step uses per-round Preview in the list — no duplicate timeline eye. */
  const eyePreviewKey = stepKey === "offer-ready" ? null : stepKey;
  const eyeBusy =
    eyePreviewKey != null &&
    previewStepLoading != null &&
    previewStepLoading === eyePreviewKey;
  const last =
    idx === JOURNEY_WORKFLOW_STEPS.length - 1 && !deviceReshipRowFollows;
  const isTerminal = journey.status === "cancelled";

  return (
    <div className="relative flex gap-3">
      {!last && (
        <div
          className={cn("absolute left-[13px] top-[28px] w-px", sent ? "bg-emerald-300 dark:bg-emerald-800" : "bg-border/40")}
          style={{ height: "calc(100% + 4px)" }}
        />
      )}
      <div className={cn(
        "relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
        needsOfferRevision || needsRequestRevision
          ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 ring-2 ring-amber-400/35"
        : sent    ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" :
        current && !isTerminal ? "border-primary bg-primary/10 text-primary" :
        "border-border/60 bg-muted/30 text-muted-foreground",
      )}>
        {sent ? <CheckCircle2 className="size-3.5" /> : <span>{idx + 1}</span>}
      </div>

      <div className={cn(
        "mb-1.5 flex flex-1 items-stretch justify-between gap-2 rounded-lg px-3 py-2 border transition-all",
        needsOfferRevision || needsRequestRevision
          ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/45 dark:bg-amber-950/30 ring-1 ring-amber-300/35"
        : sent    ? "border-emerald-100 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-950/20" :
        current && !isTerminal ? "border-primary/25 bg-primary/5 ring-1 ring-primary/10" :
        "border-border/30 bg-transparent opacity-50",
      )}>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-[12px] font-semibold",
            future || isTerminal ? "text-muted-foreground" : "text-foreground",
          )}>
            {JOURNEY_STEP_LABELS[stepKey]}
          </p>
          {needsOfferRevision && (
            <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-400/90 mt-0.5">
              Offer declined — send a revised offer or device reship
            </p>
          )}
          {needsRequestRevision && (
            <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-400/90 mt-0.5">
              Customer declined this step — resend Request Received or cancel the journey
            </p>
          )}
          {awaitingRequestAck && (
            <p className="text-[10px] font-medium text-sky-800 dark:text-sky-400/90 mt-0.5">
              Waiting for customer to use Schedule pickup or Decline in the Request Received email (round {requestAckGen})
            </p>
          )}
          {requestAckDone && (
            <>
              <p className="text-[10px] font-medium text-emerald-800 dark:text-emerald-400/90 mt-0.5">
                Customer chose Schedule pickup — you can send Pickup Scheduled when ready
              </p>
              {customerPreferredPickupDate ? (
                <p className="text-[10px] font-medium text-emerald-800/90 dark:text-emerald-400/80 mt-0.5">
                  Preferred date: {formatDateDDMMYY(customerPreferredPickupDate)}
                </p>
              ) : null}
              {customerPreferredPickupSlot ? (
                <p className="text-[10px] font-medium text-emerald-800/90 dark:text-emerald-400/80 mt-0.5">
                  Preferred time: {customerPreferredPickupSlot}
                </p>
              ) : null}
            </>
          )}
          {awaitingOfferResponse && (
            <p className="text-[10px] font-medium text-sky-800 dark:text-sky-400/90 mt-0.5">
              Waiting for customer to accept or decline this offer
            </p>
          )}
          {stepKey === "offer-ready" && (needsOfferRevision || sent) && (
            <>
              <OfferRoundHistoryList
                journey={journey}
                journeyActions={journeyActions}
                onPreviewDeliveryLog={onPreviewDeliveryLog}
                previewBusyKey={previewStepLoading ?? null}
              />
              {sent && onPreviewDeliveryLog ? (
                <OfferEmailSendsBlock
                  journeyId={journey.id || journey._id}
                  onPreviewDeliveryLog={onPreviewDeliveryLog}
                  previewBusyKey={previewStepLoading ?? null}
                />
              ) : null}
            </>
          )}
          {record && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatDateTimeDDMMYY(record.sentAt)}
              <span className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                record.deliveryStatus === "sent"   ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                record.deliveryStatus === "queued" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700",
              )}>
                {record.deliveryStatus}
              </span>
            </p>
          )}
        </div>
        {sent && onPreviewSentStep && stepKey !== "offer-ready" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 self-center text-muted-foreground hover:text-primary shadow-none focus-visible:ring-0 focus-visible:border-transparent"
            title="Preview email sent for this step"
            disabled={eyeBusy}
            onClick={() => { void onPreviewSentStep(stepKey); }}
          >
            {eyeBusy
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Eye className="size-3.5" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DeviceReshipTimelineRow({
  journey,
  onPreviewSentStep,
  previewStepLoading,
}: {
  journey: SellRequestJourney;
  onPreviewSentStep?: (step: string) => void;
  previewStepLoading?: string | null;
}) {
  const stepKey = DEVICE_RESHIP_STEP;
  const sent = journey.sentSteps?.some((s) => s.stepKey === stepKey) ?? false;
  const record = journey.sentSteps?.find((s) => s.stepKey === stepKey);
  const eyeBusy = previewStepLoading === stepKey;
  return (
    <div className="relative flex gap-3">
      <div className={cn(
        "relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
        sent
          ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
          : "border-border/60 bg-muted/30 text-muted-foreground",
      )}>
        {sent ? <CheckCircle2 className="size-3.5" /> : <Package className="size-3" />}
      </div>

      <div className={cn(
        "mb-1.5 flex flex-1 items-stretch justify-between gap-2 rounded-lg px-3 py-2 border transition-all",
        sent
          ? "border-emerald-100 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-950/20"
          : "border-border/30 bg-transparent opacity-60",
      )}>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-foreground">
            {journeyStepLabel(stepKey)}
          </p>
          {record ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatDateTimeDDMMYY(record.sentAt)}
              <span className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                record.deliveryStatus === "sent"   ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                record.deliveryStatus === "queued" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700",
              )}>
                {record.deliveryStatus}
              </span>
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Return shipment — journey closed on your side
            </p>
          )}
        </div>
        {sent && onPreviewSentStep ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 self-center text-muted-foreground hover:text-primary shadow-none focus-visible:ring-0 focus-visible:border-transparent"
            title="Preview reship email"
            disabled={eyeBusy}
            onClick={() => { void onPreviewSentStep(stepKey); }}
          >
            {eyeBusy
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Eye className="size-3.5" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function dynStr(d: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = d[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function readStepCustomMessage(d: Record<string, unknown>, stepKey: JourneyWorkflowStep): string {
  const raw = d.customMessages;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>)[stepKey];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function splitCustomMessagePayload(payload: Record<string, string>): { fields: Record<string, string>; note: string } {
  const { customMessage = "", ...fields } = payload;
  return { fields, note: customMessage };
}

function mergeStepCustomMessages(
  journey: SellRequestJourney,
  stepKey: JourneyWorkflowStep,
  note: string,
): Record<string, string> {
  const prev = { ...((journey.dynamicData?.customMessages as Record<string, string> | undefined) ?? {}) };
  const t = note.trim();
  if (t) prev[stepKey] = t;
  else delete prev[stepKey];
  return prev;
}

function buildJourneyUpdateWithNote(
  journey: SellRequestJourney,
  stepKey: JourneyWorkflowStep,
  fields: Record<string, string>,
  note: string,
): Record<string, unknown> {
  return {
    ...fields,
    customMessages: mergeStepCustomMessages(journey, stepKey, note),
  };
}

function buildSendDynamicData(fields: Record<string, string>, note: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fields };
  const t = note.trim();
  if (t) out.customMessage = t;
  return out;
}

const PICKUP_INPUT_CLASS =
  "w-full rounded border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary";

function StepCustomMessageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">
        Custom message for the customer <span className="text-[10px] opacity-60">(optional)</span>
      </label>
      <textarea
        placeholder="Shows in the email in a highlighted box. Leave empty to hide."
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(PICKUP_INPUT_CLASS, "min-h-[72px] resize-y")}
      />
    </div>
  );
}

// ── Pricing modal for offer-ready and payment-sent steps ──────────────────────

function OfferDataModal({
  onConfirm, onCancel, onPreview, currency, initial = {}, stepKey,
}: {
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
  currency: string;
  initial?: Record<string, unknown>;
  stepKey: JourneyWorkflowStep;
}) {
  const [finalOffer, setFinalOffer]           = useState(() => dynStr(initial, "finalOffer", "offerAmount"));
  const [offerExpiryHours, setOfferExpiryHours] = useState(() => dynStr(initial, "offerExpiryHours") || "48");
  const [customMessage, setCustomMessage]     = useState(() => readStepCustomMessage(initial, stepKey));

  function payload(): Record<string, string> {
    return {
      finalOffer: finalOffer.trim(),
      offerExpiryHours: offerExpiryHours.trim(),
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Offer Details</p>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Final Offer Amount ({currency})</label>
        <input
          {...MONEY_INPUT_PROPS}
          placeholder="e.g. 450"
          value={finalOffer} onChange={(e) => setFinalOffer(e.target.value)}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Offer Valid For (hours)</label>
        <input
          type="number" min="1" max="168"
          value={offerExpiryHours} onChange={(e) => setOfferExpiryHours(e.target.value)}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 flex-1 min-w-[100px] text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button
            size="sm" variant="secondary"
            className="h-7 flex-1 min-w-[100px] gap-1 text-xs"
            disabled={!finalOffer.trim()}
            onClick={() => onPreview(payload())}
          >
            <Eye className="size-3"/> Preview
          </Button>
        )}
        <Button
          size="sm" className="h-7 flex-1 min-w-[100px] text-xs"
          disabled={!finalOffer.trim()}
          onClick={() => onConfirm(payload())}
        >
          Send Offer
        </Button>
      </div>
    </div>
  );
}

function PaymentDataModal({
  onConfirm, onCancel, onPreview, currency, initial = {}, stepKey,
}: {
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
  currency: string;
  initial?: Record<string, unknown>;
  stepKey: JourneyWorkflowStep;
}) {
  const [paidAmount, setPaidAmount]           = useState(() => dynStr(initial, "paidAmount", "paymentAmount"));
  const [paymentReference, setPaymentReference] = useState(() => dynStr(initial, "paymentReference", "transactionId"));
  const [paymentMethod, setPaymentMethod]     = useState(() => dynStr(initial, "paymentMethod", "payoutMethod"));
  const [bankNote, setBankNote]               = useState(() => dynStr(initial, "bankNote"));
  const [customMessage, setCustomMessage]     = useState(() => readStepCustomMessage(initial, stepKey));
  const canPreview = !!paidAmount.trim() && !!paymentMethod;

  function payload(): Record<string, string> {
    return {
      paidAmount: paidAmount.trim(),
      paymentReference: paymentReference.trim(),
      paymentMethod,
      bankNote: bankNote.trim(),
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Payment Details</p>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Amount Paid ({currency})</label>
        <input
          {...MONEY_INPUT_PROPS}
          placeholder="e.g. 450"
          value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Reference / Transaction ID</label>
        <input
          type="text" placeholder="TXN123456"
          value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Payment Method</label>
        <select
          value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Select method…</option>
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="UPI">UPI</option>
          <option value="Cash">Cash</option>
          <option value="Cheque">Cheque</option>
          <option value="NEFT/RTGS">NEFT/RTGS</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Bank Note <span className="text-[10px] opacity-60">(optional)</span></label>
        <input
          type="text" placeholder="Any note for the customer…"
          value={bankNote} onChange={(e) => setBankNote(e.target.value)}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 flex-1 min-w-[100px] text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button
            size="sm" variant="secondary"
            className="h-7 flex-1 min-w-[100px] gap-1 text-xs"
            disabled={!canPreview}
            onClick={() => onPreview(payload())}
          >
            <Eye className="size-3" /> Preview
          </Button>
        )}
        <Button
          size="sm" className="h-7 flex-1 min-w-[100px] text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={!paidAmount.trim() || !paymentMethod}
          onClick={() => onConfirm(payload())}
        >
          Confirm Payment
        </Button>
      </div>
    </div>
  );
}

function padHm(h: string, mi: string): string {
  return `${h.padStart(2, "0")}:${mi.padStart(2, "0")}`;
}

/** HH:mm (24-panel) → e.g. "2:00 PM" */
function formatTime12Short(isoHm: string): string {
  const [hh, mm] = isoHm.split(":").map((x) => Number(x));
  if (Number.isNaN(hh)) return "";
  const dt = new Date(2000, 0, 1, hh, mm || 0);
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function buildTimeWindowForEmail(fromHm: string, toHm: string): string {
  if (!fromHm || !toHm) return "";
  return `${formatTime12Short(fromHm)}–${formatTime12Short(toHm)}`;
}

function timeHmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map((x) => Number(x));
  if (Number.isNaN(h)) return NaN;
  return h * 60 + (m || 0);
}

/** Best-effort: restore "HH:MM–HH:MM" saved from this UI (24h inputs). */
function splitSavedTimeWindow(saved: string): { from: string; to: string } {
  const s = saved.trim();
  if (!s) return { from: "", to: "" };
  const m = s.match(/^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/);
  if (!m) return { from: "", to: "" };
  const norm = (part: string) => {
    const [h, mi] = part.split(":");
    return padHm(h, mi ?? "00");
  };
  return { from: norm(m[1]), to: norm(m[2]) };
}

/** Pickup step: fields map to `dynamicData` keys used in `email-html.renderer` (pickup-scheduled). */
function PickupDataModal({
  onConfirm, onCancel, onPreview, initial, stepKey,
}: {
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
  initial: Record<string, unknown>;
  stepKey: JourneyWorkflowStep;
}) {
  const read = (k: string, alt?: string) => {
    const v = initial[k];
    if (v != null && String(v) !== "") return String(v);
    if (alt != null) return String(initial[alt] ?? "");
    return "";
  };
  const customerPreferredSlot = readCustomerPreferredPickupTimeSlot(initial);
  const customerPreferredDateIso = readCustomerPreferredPickupDate(initial);
  const customerPreferredAny =
    initial.customerPreferredPickupTimeAny === true || isRepairPickupTimeAny(customerPreferredSlot);
  const customerPreferredHm =
    !customerPreferredAny && customerPreferredSlot
      ? parseRepairPickupTimeWindowToHm(customerPreferredSlot)
      : null;
  const savedWindow = splitSavedTimeWindow(read("pickupTime", "pickupTimeSlot"));
  const [dateIso, setDateIso] = useState(
    () => parsePickupDateToIso(read("pickupDate")) || customerPreferredDateIso || "",
  );
  const [timeFrom, setTimeFrom] = useState(
    () => savedWindow.from || customerPreferredHm?.from || "",
  );
  const [timeTo, setTimeTo] = useState(
    () => savedWindow.to || customerPreferredHm?.to || "",
  );
  const [pickupAddress, setPickupAddress] = useState(() => read("pickupAddress"));
  const [agentName, setAgentName]       = useState(() => read("agentName"));
  const [agentPhone, setAgentPhone]     = useState(() => read("agentPhone", "agentContact"));
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const pickupDateLabel = formatPickupDateForEmail(dateIso);
  const pickupTimeLabel = buildTimeWindowForEmail(timeFrom, timeTo);
  const fromM = timeHmToMinutes(timeFrom);
  const toM = timeHmToMinutes(timeTo);
  const windowOk =
    dateIso.length > 0 &&
    timeFrom.length > 0 &&
    timeTo.length > 0 &&
    Number.isFinite(fromM) &&
    Number.isFinite(toM) &&
    toM > fromM;

  const canSend =
    Boolean(pickupDateLabel) &&
    windowOk &&
    pickupAddress.trim().length > 0;

  function payload(): Record<string, string> {
    return {
      pickupDate: pickupDateLabel,
      pickupTime: pickupTimeLabel,
      pickupAddress: pickupAddress.trim(),
      agentName: agentName.trim(),
      agentPhone: agentPhone.trim(),
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-emerald-300/80 dark:border-emerald-800/50 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pickup schedule</p>
      {customerPreferredSlot || customerPreferredDateIso ? (
        <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-[11px] leading-relaxed text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100">
          Customer selected:
          {customerPreferredDateIso ? (
            <>
              {" "}
              <strong className="font-semibold">{formatDateDDMMYY(customerPreferredDateIso)}</strong>
            </>
          ) : null}
          {customerPreferredSlot ? (
            <>
              {customerPreferredDateIso ? " · " : " "}
              <strong className="font-semibold">{customerPreferredSlot}</strong>
            </>
          ) : null}
          {customerPreferredAny
            ? " — set the pickup time below before sending."
            : " — pre-filled below; adjust if needed."}
        </div>
      ) : null}
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Pickup date</label>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className={cn(PICKUP_INPUT_CLASS, "pl-8 [color-scheme:light] dark:[color-scheme:dark]")}
          />
        </div>
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Time window</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="mb-0.5 block text-[10px] text-muted-foreground/90">From</span>
            <input
              type="time"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
              className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
            />
          </div>
          <div>
            <span className="mb-0.5 block text-[10px] text-muted-foreground/90">To</span>
            <input
              type="time"
              value={timeTo}
              onChange={(e) => setTimeTo(e.target.value)}
              className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
            />
          </div>
        </div>
        {pickupDateLabel && pickupTimeLabel && windowOk ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Customer sees:{" "}
            <span className="font-medium text-foreground">{pickupDateLabel}</span>
            {" · "}
            <span className="font-medium text-foreground">{pickupTimeLabel}</span>
          </p>
        ) : null}
        {timeFrom && timeTo && !windowOk ? (
          <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">End time must be after start time.</p>
        ) : null}
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Pickup address</label>
        <textarea
          placeholder="Full address / area"
          rows={2}
          value={pickupAddress}
          onChange={(e) => setPickupAddress(e.target.value)}
          className="min-h-[52px] w-full resize-y rounded border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Agent name <span className="text-[10px] opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="Field agent"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className={PICKUP_INPUT_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Agent phone <span className="text-[10px] opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="+971 …"
            value={agentPhone}
            onChange={(e) => setAgentPhone(e.target.value)}
            className={PICKUP_INPUT_CLASS}
          />
        </div>
      </div>
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 min-w-[100px] flex-1 text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 min-w-[100px] flex-1 gap-1 text-xs"
            disabled={!canSend}
            onClick={() => onPreview(payload())}
          >
            <Eye className="size-3" /> Preview
          </Button>
        )}
        <Button
          size="sm"
          className="h-7 min-w-[100px] flex-1 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
          disabled={!canSend}
          onClick={() => onConfirm(payload())}
        >
          Send pickup email
        </Button>
      </div>
    </div>
  );
}

/** First email — fields match request-received table in `email-html.renderer`. */
function RequestReceivedDataModal({
  initial, currency, onConfirm, onCancel, onPreview, stepKey,
}: {
  initial: Record<string, unknown>;
  currency: string;
  stepKey: JourneyWorkflowStep;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
}) {
  const [deviceName, setDeviceName] = useState(() => dynStr(initial, "deviceName"));
  const [deviceBrand, setDeviceBrand] = useState(() => dynStr(initial, "deviceBrand"));
  const [estMin, setEstMin] = useState(() =>
    dynStr(initial, "estimatedPriceMin") || dynStr(initial, "estimatedPrice"),
  );
  const [estMax, setEstMax] = useState(() => dynStr(initial, "estimatedPriceMax"));
  const condInit = parseDeviceCondition(dynStr(initial, "deviceCondition", "condition"));
  const [cond, setCond] = useState(() => condInit.select);
  const [condOther, setCondOther] = useState(() => condInit.other);
  const [dateIso, setDateIso] = useState(() => parsePickupDateToIso(dynStr(initial, "requestDate")));
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const requestDateLabel = formatPickupDateForEmail(dateIso);
  const condOk =
    cond.trim().length > 0 &&
    (cond !== "Other" || condOther.trim().length > 0);
  const canSend =
    deviceName.trim().length > 0 &&
    dateIso.length > 0 &&
    Boolean(requestDateLabel) &&
    condOk;

  function payload(): Record<string, string> {
    const o: Record<string, string> = {
      deviceName: deviceName.trim(),
      deviceBrand: deviceBrand.trim(),
      deviceCondition: formatDeviceCondition(cond, condOther),
      requestDate: requestDateLabel,
      customMessage: customMessage.trim(),
    };
    if (estMin.trim()) o.estimatedPriceMin = estMin.trim();
    if (estMax.trim()) o.estimatedPriceMax = estMax.trim();
    return o;
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Request details (email)</p>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Item name</label>
        <input
          type="text"
          placeholder="e.g. LG washing machine, 55&quot; TV, iPhone 15 Pro"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">Brand</label>
          <input type="text" placeholder="Apple" value={deviceBrand} onChange={(e) => setDeviceBrand(e.target.value)} className={PICKUP_INPUT_CLASS} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">
          Condition <span className="text-destructive">*</span>
        </label>
        <select
          value={cond}
          onChange={(e) => {
            const v = e.target.value;
            setCond(v);
            if (v !== "Other") setCondOther("");
          }}
          className={PICKUP_INPUT_CLASS}
        >
          <option value="">Select condition…</option>
          {SELL_CONDITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {cond === "Other" ? (
          <div className="mt-2">
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Custom condition <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              placeholder="Describe condition…"
              value={condOther}
              onChange={(e) => setCondOther(e.target.value)}
              className={PICKUP_INPUT_CLASS}
            />
          </div>
        ) : null}
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Request date</label>
        <input
          type="date"
          value={dateIso}
          onChange={(e) => setDateIso(e.target.value)}
          className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Min estimate <span className="opacity-70">({currency})</span> <span className="text-[10px] opacity-60">(optional)</span>
          </label>
          <input
            {...MONEY_INPUT_PROPS}
            placeholder="e.g. 400"
            value={estMin}
            onChange={(e) => setEstMin(e.target.value)}
            className={PICKUP_INPUT_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Max estimate <span className="opacity-70">({currency})</span> <span className="text-[10px] opacity-60">(optional)</span>
          </label>
          <input
            {...MONEY_INPUT_PROPS}
            placeholder="e.g. 600"
            value={estMax}
            onChange={(e) => setEstMax(e.target.value)}
            className={PICKUP_INPUT_CLASS}
          />
        </div>
      </div>
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 min-w-[100px] flex-1 text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button size="sm" variant="secondary" className="h-7 min-w-[100px] flex-1 gap-1 text-xs" disabled={!canSend} onClick={() => onPreview(payload())}>
            <Eye className="size-3" /> Preview
          </Button>
        )}
        <Button size="sm" className="h-7 min-w-[100px] flex-1 text-xs" disabled={!canSend} onClick={() => onConfirm(payload())}>
          Send request email
        </Button>
      </div>
    </div>
  );
}

/** Inspection underway — inspector + started date/time for email table. */
function InspectionDataModal({
  initial, onConfirm, onCancel, onPreview, stepKey,
}: {
  initial: Record<string, unknown>;
  stepKey: JourneyWorkflowStep;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
}) {
  const [inspectorName, setInspectorName] = useState(() => dynStr(initial, "inspectorName"));
  const [dateIso, setDateIso] = useState(() => parsePickupDateToIso(dynStr(initial, "inspectionStartDate")));
  const [timeHm, setTimeHm] = useState(() => {
    const combined = dynStr(initial, "inspectionStartTime");
    const m = combined.match(/(\d{1,2}:\d{2})\s*(?:[AP]M)?\s*$/i);
    if (m) {
      const [h, mi] = m[1].split(":").map((x) => Number(x));
      if (!Number.isNaN(h)) return `${String(h).padStart(2, "0")}:${String(mi || 0).padStart(2, "0")}`;
    }
    return "";
  });
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const startedLabel =
    dateIso && timeHm ? `${formatPickupDateForEmail(dateIso)} · ${formatTime12Short(timeHm)}` : "";

  const canSend =
    inspectorName.trim().length > 0 &&
    dateIso.length > 0 &&
    timeHm.length > 0 &&
    Boolean(startedLabel);

  function payload(): Record<string, string> {
    return {
      inspectorName: inspectorName.trim(),
      inspectionStartTime: startedLabel,
      inspectionStartDate: formatPickupDateForEmail(dateIso),
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-amber-200/80 bg-card p-4 space-y-3 dark:border-amber-900/40">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Inspection notice</p>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Inspector name</label>
        <input
          type="text"
          placeholder="Inspector name"
          value={inspectorName}
          onChange={(e) => setInspectorName(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">Started date</label>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">Started time</label>
          <input
            type="time"
            value={timeHm}
            onChange={(e) => setTimeHm(e.target.value)}
            className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
          />
        </div>
      </div>
      {startedLabel ? (
        <p className="text-[10px] text-muted-foreground">
          Email “Started at”: <span className="font-medium text-foreground">{startedLabel}</span>
        </p>
      ) : null}
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 min-w-[100px] flex-1 text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button size="sm" variant="secondary" className="h-7 min-w-[100px] flex-1 gap-1 text-xs" disabled={!canSend} onClick={() => onPreview(payload())}>
            <Eye className="size-3" /> Preview
          </Button>
        )}
        <Button size="sm" className="h-7 min-w-[100px] flex-1 text-xs" disabled={!canSend} onClick={() => onConfirm(payload())}>
          Send inspection email
        </Button>
      </div>
    </div>
  );
}

/** Journey completed — summary fields for completed step email. */
function JourneyCompletedDataModal({
  initial, currency, onConfirm, onCancel, onPreview, stepKey,
}: {
  initial: Record<string, unknown>;
  currency: string;
  stepKey: JourneyWorkflowStep;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
}) {
  const [finalAmount, setFinalAmount] = useState(() => dynStr(initial, "finalAmount", "paidAmount"));
  const [dateIso, setDateIso] = useState(() => parsePickupDateToIso(dynStr(initial, "completionDate")));
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const completionDateLabel = formatPickupDateForEmail(dateIso);
  const canSend = finalAmount.trim().length > 0 && dateIso.length > 0 && Boolean(completionDateLabel);

  function payload(): Record<string, string> {
    return {
      finalAmount: finalAmount.trim(),
      completionDate: completionDateLabel,
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-emerald-300/80 bg-card p-4 space-y-3 dark:border-emerald-800/50">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Completion</p>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Final amount ({currency})</label>
        <input
          {...MONEY_INPUT_PROPS}
          placeholder="Amount customer received"
          value={finalAmount}
          onChange={(e) => setFinalAmount(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Completed on</label>
        <input
          type="date"
          value={dateIso}
          onChange={(e) => setDateIso(e.target.value)}
          className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
        />
      </div>
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 min-w-[100px] flex-1 text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button size="sm" variant="secondary" className="h-7 min-w-[100px] flex-1 gap-1 text-xs" disabled={!canSend} onClick={() => onPreview(payload())}>
            <Eye className="size-3" /> Preview
          </Button>
        )}
        <Button size="sm" className="h-7 min-w-[100px] flex-1 bg-emerald-600 text-xs text-white hover:bg-emerald-700" disabled={!canSend} onClick={() => onConfirm(payload())}>
          Send completion email
        </Button>
      </div>
    </div>
  );
}

// ── Staff notes panel ─────────────────────────────────────────────────────────

function StaffNotesPanel({ journey, onRefresh }: { journey: SellRequestJourney; onRefresh: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const notes: StaffNote[] = (journey.staffNotes ?? []);

  async function handleAdd() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await sellService.addStaffNote(journey._id, text.trim());
      setText("");
      onRefresh();
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(idx: number) {
    setDeletingIdx(idx);
    try {
      await sellService.deleteStaffNote(journey._id, idx);
      onRefresh();
    } catch {
      toast.error("Failed to delete note");
    } finally {
      setDeletingIdx(null);
    }
  }

  function fmtDate(iso: string) {
    return formatDateTimeDDMMYY(iso);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Input */}
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add internal note… (staff-only, never sent to customer)"
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{text.length}/2000</span>
          <Button
            size="sm" variant="default"
            className="h-7 gap-1 text-[11px]"
            disabled={!text.trim() || saving}
            onClick={handleAdd}
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            Add note
          </Button>
        </div>
      </div>

      {/* Existing notes */}
      {notes.length === 0 ? (
        <p className="text-center text-[11px] text-muted-foreground py-3">No internal notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n, i) => (
            <div key={i} className="group relative rounded-lg border border-border bg-muted/20 px-3 py-2.5">
              <p className="whitespace-pre-wrap text-[12px] text-foreground leading-relaxed">{n.text}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{fmtDate(n.createdAt)}</span>
                <button
                  onClick={() => handleDelete(i)}
                  disabled={deletingIdx === i}
                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-muted-foreground hover:text-red-500"
                  title="Delete note"
                >
                  {deletingIdx === i
                    ? <Loader2 className="size-3 animate-spin" />
                    : <Trash2 className="size-3" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Action panel (state machine) ──────────────────────────────────────────────

function ActionPanel({
  journey, id, onSuccess, previewEmail, previewBusy,
}: {
  journey: SellRequestJourney; id: string; onSuccess: () => void;
  previewEmail: (
    step: string,
    extraDynamic?: Record<string, string>,
    options?: { deliveryLogId?: string },
  ) => void;
  previewBusy: boolean;
}) {
  const [confirming, setConfirming]     = useState<"cancel" | "decline" | null>(null);
  const [resendStep, setResendStep]     = useState<JourneyWorkflowStep | null>(null);
  const [sending, setSending]           = useState(false);
  const [showRequestForm, setShowRequestForm]     = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [showPickupForm, setShowPickupForm]   = useState(false);
  const [showPricingForm, setShowPricingForm] = useState(false);
  const [showCompletedForm, setShowCompletedForm]   = useState(false);
  const [showReshipForm, setShowReshipForm] = useState(false);
  const [reshipCourier, setReshipCourier] = useState("");
  const [reshipTracking, setReshipTracking] = useState("");
  const [reshipTrackingUrl, setReshipTrackingUrl] = useState("");
  const [reshipCustomMessage, setReshipCustomMessage] = useState("");

  const { mutate: sendStep }    = useSendJourneyStep();
  const { mutate: resendMutate } = useResendJourneyStep();
  const { mutate: updateData }  = useUpdateJourneyData();
  const { mutate: cancelMutate, isPending: cancelling }  = useCancelJourney();
  const { mutate: declineMutate, isPending: declining }  = useDeclineOffer();
  const { mutate: sendReshipMutate, isPending: reshipping } = useSendDeviceReship();

  const isHardTerminal =
    journey.status === "completed" || journey.status === "cancelled" || journey.status === "no_customer_action";
  const isOfferDeclined = journey.status === "offer_declined";
  const isRequestDeclined = journey.status === "request_declined";
  const currentStep = journey.currentStep as JourneyWorkflowStep;
  // If Request Received email hasn't been sent yet, first action is to send it
  const firstEmailSent = journey.completedSteps.includes("request-received");
  const offerSent   = journey.completedSteps.includes("offer-ready");
  const requestAckGen = requestAckEffectiveGen(journey);
  const pickupBlockedPendingRequestAck =
    journey.status === "active" &&
    firstEmailSent &&
    requestAckGen > 0 &&
    !customerAcknowledgedCurrentRequest(journey);
  const paymentPhaseBlocked =
    journey.status === "active" &&
    offerSent &&
    currentStep === "payment-sent" &&
    !customerAcceptedCurrentOffer(journey);
  const baseNextAction = !isHardTerminal
    ? (() => {
        if (isRequestDeclined && firstEmailSent) {
          return {
            label: "Resend Request Received",
            description:
              "Customer declined the confirmation on this step. Send the email again with fresh Schedule pickup / Decline links, or cancel the journey below.",
            nextStep: "request-received" as const,
            Icon: Send,
            variant: "primary" as const,
          };
        }
        if (isOfferDeclined && offerSent) {
          const oa = NEXT_ACTION["offer-ready"];
          return oa
            ? {
                ...oa,
                label: "Send revised offer",
                description:
                  "Customer declined the last offer. Enter updated terms and send a new offer email with fresh accept/decline links.",
              }
            : null;
        }
        if (paymentPhaseBlocked) {
          return null;
        }
        if (pickupBlockedPendingRequestAck) {
          return null;
        }
        if (currentStep === "request-received" && !firstEmailSent) {
          return SEND_REQUEST_EMAIL_ACTION;
        }
        return NEXT_ACTION[currentStep] ?? null;
      })()
    : null;
  const nextAction = baseNextAction;
  const canDecline  = offerSent && journey.status === "active" && currentStep !== "completed";
  const canReship   = offerSent && !isHardTerminal;
  const offerGen    = typeof journey.offerGeneration === "number" ? journey.offerGeneration : (offerSent ? 1 : 0);
  const revisedOfferSendCount = Math.max(0, offerGen - 1);
  const needsPickupForm  = nextAction?.nextStep === "pickup-scheduled";
  const needsPricingForm = nextAction?.nextStep === "offer-ready" || nextAction?.nextStep === "payment-sent";
  const needsRequestForm = nextAction?.nextStep === "request-received";
  const needsInspectionForm = nextAction?.nextStep === "inspection-underway";
  const needsCompletedForm = nextAction?.nextStep === "completed";

  function doSend(extraData?: Record<string, unknown>) {
    if (!nextAction) return;
    setSending(true);
    setShowRequestForm(false);
    setShowInspectionForm(false);
    setShowPickupForm(false);
    setShowPricingForm(false);
    setShowCompletedForm(false);
    setShowReshipForm(false);

    const reviseOfferAfterDecline =
      journey.status === "offer_declined" && nextAction.nextStep === "offer-ready";

    const resendRequestAfterDecline =
      journey.status === "request_declined" && nextAction.nextStep === "request-received";

    if (resendRequestAfterDecline) {
      resendMutate(
        { id, step: "request-received", payload: { dynamicData: extraData ?? {} } },
        {
          onSuccess: () => {
            toast.success(`${nextAction.label} — email sent`);
            onSuccess();
          },
          onError: (e: unknown) => toast.error(extractMsg(e)),
          onSettled: () => setSending(false),
        },
      );
      return;
    }

    if (reviseOfferAfterDecline) {
      resendMutate(
        { id, step: nextAction.nextStep, payload: { dynamicData: extraData ?? {} } },
        {
          onSuccess: () => {
            toast.success(`${nextAction.label} — email sent`);
            onSuccess();
          },
          onError: (e: unknown) => toast.error(extractMsg(e)),
          onSettled: () => setSending(false),
        },
      );
      return;
    }

    sendStep(
      { id, step: nextAction.nextStep, payload: { dynamicData: extraData ?? {} } },
      {
        onSuccess: () => { toast.success(`${nextAction.label} — email sent`); onSuccess(); },
        onError: (e: unknown) => toast.error(extractMsg(e)),
        onSettled: () => setSending(false),
      },
    );
  }

  function handlePricingConfirm(pricingData: Record<string, string>) {
    if (!nextAction) return;
    const { fields, note } = splitCustomMessagePayload(pricingData);
    const data = buildJourneyUpdateWithNote(journey, nextAction.nextStep, fields, note);
    updateData(
      { id, data },
      {
        onSuccess: () => doSend(buildSendDynamicData(fields, note)),
        onError:   (e: unknown) => { toast.error(extractMsg(e)); setSending(false); },
      },
    );
  }

  function handlePickupConfirm(pickupData: Record<string, string>) {
    const { fields, note } = splitCustomMessagePayload(pickupData);
    const data = buildJourneyUpdateWithNote(journey, "pickup-scheduled", fields, note);
    updateData(
      { id, data },
      {
        onSuccess: () => doSend(buildSendDynamicData(fields, note)),
        onError:   (e: unknown) => { toast.error(extractMsg(e)); setSending(false); },
      },
    );
  }

  /** Save journey dynamicData then send the current next-step email (request / inspection / completed). */
  function handleStepFormConfirm(data: Record<string, string>) {
    if (!nextAction) return;
    const { fields, note } = splitCustomMessagePayload(data);
    const updatePayload = buildJourneyUpdateWithNote(journey, nextAction.nextStep, fields, note);
    updateData(
      { id, data: updatePayload },
      {
        onSuccess: () => doSend(buildSendDynamicData(fields, note)),
        onError:   (e: unknown) => { toast.error(extractMsg(e)); setSending(false); },
      },
    );
  }

  function handleSendClick() {
    setShowReshipForm(false);
    if (needsPickupForm) {
      setShowPickupForm(true);
      return;
    }
    if (needsPricingForm) {
      setShowPricingForm(true);
      return;
    }
    if (needsRequestForm) {
      setShowRequestForm(true);
      return;
    }
    if (needsInspectionForm) {
      setShowInspectionForm(true);
      return;
    }
    if (needsCompletedForm) {
      setShowCompletedForm(true);
      return;
    }
    doSend();
  }

  function doResend(step: JourneyWorkflowStep) {
    setSending(true);
    resendMutate(
      { id, step, payload: {} },
      {
        onSuccess: () => { toast.success("Email resent"); onSuccess(); setResendStep(null); },
        onError: (e: unknown) => toast.error(extractMsg(e)),
        onSettled: () => setSending(false),
      },
    );
  }

  function doCancel() {
    cancelMutate(id, {
      onSuccess: () => { toast.success("Request cancelled"); onSuccess(); setConfirming(null); },
      onError: (e: unknown) => toast.error(extractMsg(e)),
    });
  }

  function doDecline() {
    declineMutate(id, {
      onSuccess: () => { toast.success("Offer marked as declined"); onSuccess(); setConfirming(null); },
      onError: (e: unknown) => toast.error(extractMsg(e)),
    });
  }

  function submitDeviceReship() {
    const c = reshipCourier.trim();
    const t = reshipTracking.trim();
    const linkRaw = reshipTrackingUrl.trim();
    if (!c || !t) {
      toast.error("Courier name and tracking number are required.");
      return;
    }
    if (linkRaw) {
      try {
        const u = new URL(linkRaw);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          toast.error("Tracking link must start with http:// or https://");
          return;
        }
      } catch {
        toast.error("Please enter a valid tracking link URL.");
        return;
      }
    }
    sendReshipMutate(
      {
        id,
        courierName: c,
        trackingNumber: t,
        trackingUrl: linkRaw || undefined,
        customMessage: reshipCustomMessage.trim() || undefined,
      },
      {
        onSuccess: () => {
          onSuccess();
          setShowReshipForm(false);
          setReshipCourier("");
          setReshipTracking("");
          setReshipTrackingUrl("");
          setReshipCustomMessage("");
        },
      },
    );
  }

  // Terminal states (negotiation continues when status is offer_declined)
  if (journey.status === "completed") {
    const dd = journey.dynamicData as Record<string, unknown>;
    const byReship = dd?.closedByReship === true;
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-5 text-center">
        <BadgeCheck className="mx-auto mb-2 size-8 text-emerald-500" />
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">
          {byReship ? "Closed — device reship" : "Journey Completed"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {byReship
            ? "Reship email was sent and this journey is fully closed on your side."
            : "All 6 steps completed successfully."}
        </p>
        {byReship && dd.reshipMessage != null && String(dd.reshipMessage).trim() !== "" && (
          <p className="text-[11px] text-muted-foreground mt-3 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-card/80 px-3 py-2 text-left italic">
            <span className="font-semibold text-foreground not-italic">Your note to the customer: </span>
            {String(dd.reshipMessage)}
          </p>
        )}
        {byReship && Boolean(dd.reshipCourier || dd.reshipTracking) && (
          <p className="text-[11px] text-muted-foreground mt-3 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-card/80 px-3 py-2 text-left">
            {dd.reshipCourier != null && dd.reshipCourier !== "" && (
              <span className="block"><span className="font-semibold text-foreground">Courier:</span> {String(dd.reshipCourier)}</span>
            )}
            {dd.reshipTracking != null && dd.reshipTracking !== "" && (
              <span className="block mt-1"><span className="font-semibold text-foreground">Tracking:</span> {String(dd.reshipTracking)}</span>
            )}
            {dd.reshipTrackingUrl != null && String(dd.reshipTrackingUrl).trim() !== "" && (
              <span className="block mt-2">
                <span className="font-semibold text-foreground">Tracking link: </span>
                <a
                  href={String(dd.reshipTrackingUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium break-all underline-offset-2 hover:underline"
                >
                  {String(dd.reshipTrackingUrl)}
                </a>
              </span>
            )}
          </p>
        )}
      </div>
    );
  }

  if (journey.status === "no_customer_action") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/30 p-5 text-center">
        <Clock className="mx-auto mb-2 size-8 text-slate-500" />
        <p className="font-semibold text-foreground">Closed — No customer action</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          The customer did not respond within 24 hours after the reminder email. This request was closed automatically.
        </p>
      </div>
    );
  }

  if (journey.status === "cancelled") {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-5 text-center">
        <XCircle className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="font-semibold text-foreground">Request Cancelled</p>
        <p className="text-xs text-muted-foreground mt-1">This request has been cancelled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isOfferDeclined && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400/90">Offer declined</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Customer declined the current offer. Send a revised offer from Next Action (new links), resend Offer Ready from below, or close the request by sending a device reship with tracking details.
          </p>
        </div>
      )}

      {isRequestDeclined && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400/90">Request confirmation declined</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            The customer declined from the Request Received email. Use Next Action to resend that email with fresh links, or cancel the journey in Danger Zone if you want to close it.
          </p>
        </div>
      )}

      {pickupBlockedPendingRequestAck && (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-400/90">Awaiting customer (Schedule pickup)</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Pickup cannot be scheduled until the customer taps <strong className="text-foreground">Schedule pickup</strong> on the latest Request Received email (round {requestAckGen}). Resend that step from below if needed.
          </p>
        </div>
      )}

      {paymentPhaseBlocked && (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-400/90">Awaiting customer acceptance</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Payment cannot be sent until the customer accepts the latest offer (round {offerEffectiveGen(journey)}) using the links in their email. The timeline below shows offer emails, accepts, and declines.
          </p>
        </div>
      )}

      {offerSent && (
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-2.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Offer emails sent</p>
            <p className="text-xs font-semibold text-foreground mt-0.5 tabular-nums">
              {offerGen || 1} total
              {revisedOfferSendCount > 0 && (
                <span className="font-normal text-muted-foreground"> · {revisedOfferSendCount} revised</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Primary next action */}
      {nextAction && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Next Action
          </p>

          <div className="flex items-start gap-3 mb-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <nextAction.Icon className="size-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-[14px] text-foreground">{nextAction.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{nextAction.description}</p>
            </div>
          </div>

          {/* Pricing form or send button */}
          <AnimatePresence mode="wait">
            {showRequestForm ? (
              <motion.div key="request-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <RequestReceivedDataModal
                  stepKey="request-received"
                  initial={journey.dynamicData ?? {}}
                  currency={journey.currency}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowRequestForm(false)}
                  onPreview={(data) => { previewEmail("request-received", data); }}
                />
              </motion.div>
            ) : showInspectionForm ? (
              <motion.div key="inspection-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <InspectionDataModal
                  stepKey="inspection-underway"
                  initial={journey.dynamicData ?? {}}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowInspectionForm(false)}
                  onPreview={(data) => { previewEmail("inspection-underway", data); }}
                />
              </motion.div>
            ) : showPickupForm ? (
              <motion.div key="pickup-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <PickupDataModal
                  stepKey="pickup-scheduled"
                  initial={journey.dynamicData ?? {}}
                  onConfirm={handlePickupConfirm}
                  onCancel={() => setShowPickupForm(false)}
                  onPreview={(data) => { previewEmail("pickup-scheduled", data); }}
                />
              </motion.div>
            ) : showPricingForm ? (
              <motion.div key="pricing-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {nextAction.nextStep === "offer-ready" ? (
                  <OfferDataModal
                    stepKey="offer-ready"
                    currency={journey.currency}
                    initial={journey.dynamicData ?? {}}
                    onConfirm={handlePricingConfirm}
                    onCancel={() => setShowPricingForm(false)}
                    onPreview={(data) => { previewEmail("offer-ready", data); }}
                  />
                ) : (
                  <PaymentDataModal
                    stepKey="payment-sent"
                    currency={journey.currency}
                    initial={journey.dynamicData ?? {}}
                    onConfirm={handlePricingConfirm}
                    onCancel={() => setShowPricingForm(false)}
                    onPreview={(data) => { previewEmail("payment-sent", data); }}
                  />
                )}
              </motion.div>
            ) : showCompletedForm ? (
              <motion.div key="completed-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <JourneyCompletedDataModal
                  stepKey="completed"
                  initial={journey.dynamicData ?? {}}
                  currency={journey.currency}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowCompletedForm(false)}
                  onPreview={(data) => { previewEmail("completed", data); }}
                />
              </motion.div>
            ) : confirming !== "cancel" && confirming !== "decline" ? (
              <motion.div key="send-btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 min-w-0"
                  onClick={() => { previewEmail(nextAction.nextStep); }}
                  disabled={sending || previewBusy}
                >
                  {previewBusy
                    ? <Loader2 className="size-4 animate-spin shrink-0" />
                    : <Eye className="size-4 shrink-0" />}
                  Preview
                </Button>
                <Button
                  className="flex-[1.35] gap-2 min-w-0"
                  onClick={handleSendClick}
                  disabled={sending || previewBusy}
                >
                  {sending ? <Loader2 className="size-4 animate-spin shrink-0" /> : <nextAction.Icon className="size-4 shrink-0" />}
                  <span className="truncate">{sending ? "Sending email…" : nextAction.label}</span>
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}

      {canReship && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Return shipment
          </p>
          <div className="flex items-start gap-3 mb-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
              <Package className="size-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="font-semibold text-[14px] text-foreground">Return shipment to customer</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Optional custom message appears as a personal note. Add a tracking link to show a &quot;Track Now&quot; button in the email. Sending completes and closes this journey.
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {showReshipForm ? (
              <motion.div key="reship-fields" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] text-muted-foreground">Courier name</label>
                  <input
                    type="text"
                    placeholder="e.g. BlueDart, FedEx"
                    value={reshipCourier}
                    onChange={(e) => setReshipCourier(e.target.value)}
                    className={PICKUP_INPUT_CLASS}
                    disabled={reshipping}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted-foreground">Tracking number</label>
                  <input
                    type="text"
                    placeholder="Tracking / AWB number"
                    value={reshipTracking}
                    onChange={(e) => setReshipTracking(e.target.value)}
                    className={PICKUP_INPUT_CLASS}
                    disabled={reshipping}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted-foreground">Tracking link (optional)</label>
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://… (opens when customer taps Track Now)"
                    value={reshipTrackingUrl}
                    onChange={(e) => setReshipTrackingUrl(e.target.value)}
                    className={PICKUP_INPUT_CLASS}
                    disabled={reshipping}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">Must be http or https. Leave empty if you only want courier &amp; AWB in the email table.</p>
                </div>
                <StepCustomMessageField value={reshipCustomMessage} onChange={setReshipCustomMessage} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[96px]"
                    onClick={() => {
                      setShowReshipForm(false);
                      setReshipCourier("");
                      setReshipTracking("");
                      setReshipTrackingUrl("");
                      setReshipCustomMessage("");
                    }}
                    disabled={reshipping}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[96px] gap-1.5"
                    onClick={() => {
                      previewEmail("device-reship", {
                        reshipCourier: reshipCourier.trim(),
                        reshipTracking: reshipTracking.trim(),
                        ...(reshipTrackingUrl.trim()
                          ? { reshipTrackingUrl: reshipTrackingUrl.trim() }
                          : {}),
                        ...(reshipCustomMessage.trim()
                          ? { reshipMessage: reshipCustomMessage.trim() }
                          : {}),
                      });
                    }}
                    disabled={reshipping || previewBusy}
                  >
                    {previewBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                    Preview
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-[1.2] min-w-[120px] gap-1.5"
                    onClick={submitDeviceReship}
                    disabled={reshipping}
                  >
                    {reshipping ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Send & close
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="reship-cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => {
                    setConfirming(null);
                    setShowRequestForm(false);
                    setShowInspectionForm(false);
                    setShowPickupForm(false);
                    setShowPricingForm(false);
                    setShowCompletedForm(false);
                    setShowReshipForm(true);
                  }}
                  disabled={reshipping || sending}
                >
                  <Package className="size-4 shrink-0" />
                  Enter reship details…
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Resend section */}
      {journey.completedSteps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setResendStep(resendStep ? null : (journey.completedSteps[0] as JourneyWorkflowStep))}
            className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            <span>Resend Emails</span>
            {resendStep !== null ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>

          <AnimatePresence>
            {resendStep !== null && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-1.5">
                  {journey.completedSteps
                    .filter((s) => RESEND_ALLOWED.has(s as JourneyWorkflowStep))
                    .map((step) => (
                      <div
                        key={step}
                        className="flex w-full items-center gap-1.5 rounded-lg border border-border bg-muted/10 px-1.5 py-1"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-primary"
                          title="Preview email"
                          disabled={sending || previewBusy}
                          onClick={() => { previewEmail(step as string); }}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => doResend(step as JourneyWorkflowStep)}
                          className="flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                        >
                          <span className="truncate">{JOURNEY_STEP_LABELS[step as JourneyWorkflowStep]}</span>
                          <RotateCcw className="size-3 shrink-0 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  {journey.completedSteps.filter((s) => RESEND_ALLOWED.has(s as JourneyWorkflowStep)).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-1">No resendable steps yet.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Danger zone */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Danger Zone</p>
        <div className="space-y-2">

          {/* Decline offer */}
          {canDecline && (
            <AnimatePresence mode="wait">
              {confirming !== "decline" ? (
                <motion.button
                  key="btn"
                  type="button"
                  onClick={() => setConfirming("decline")}
                  className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400 transition-colors"
                >
                  <XCircle className="size-3.5" /> Decline Offer
                </motion.button>
              ) : (
                <motion.div key="confirm-decline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">Mark offer as declined?</p>
                  <p className="text-[11px] text-muted-foreground mb-3">This will set the journey status to "Offer Declined".</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setConfirming(null)}>Cancel</Button>
                    <Button size="sm" className="h-7 flex-1 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={doDecline} disabled={declining}>
                      {declining ? <Loader2 className="size-3 animate-spin" /> : "Decline"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Cancel request */}
          <AnimatePresence mode="wait">
            {confirming !== "cancel" ? (
              <motion.button
                key="btn-cancel"
                type="button"
                onClick={() => setConfirming("cancel")}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/60 transition-colors"
              >
                <XCircle className="size-3.5" /> Cancel Request
              </motion.button>
            ) : (
              <motion.div key="confirm-cancel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Cancel this request?</p>
                <p className="text-[11px] text-muted-foreground mb-3">This action cannot be undone.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setConfirming(null)}>Keep</Button>
                  <Button size="sm" variant="destructive" className="h-7 flex-1 text-xs" onClick={doCancel} disabled={cancelling}>
                    {cancelling ? <Loader2 className="size-3 animate-spin" /> : "Cancel Request"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}

// ── Error helper ──────────────────────────────────────────────────────────────
function extractMsg(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const r = (err as { response?: { data?: { message?: unknown } } }).response;
    const m = r?.data?.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m[0] ?? "Something went wrong";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SellRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: raw, isLoading, refetch, isFetching } = useJourney(id);
  const { data: journeyActionsRaw } = useJourneyActions(id ?? undefined);
  const journeyActions = journeyActionsRaw ?? [];
  const journey: SellRequestJourney | undefined = raw as unknown as SellRequestJourney;

  const handleSuccess = useCallback(() => { refetch(); }, [refetch]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"actions" | "notes">("actions");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewStepKey, setPreviewStepKey] = useState<string>("");
  const [previewStepLoading, setPreviewStepLoading] = useState<string | null>(null);
  const previewRunRef = useRef(0);

  const { mutateAsync: loadPreview, isPending: previewLoading } = usePreviewJourneyEmail();

  const openEmailPreview = useCallback(async (
    step: string,
    extraDynamic?: Record<string, string>,
    options?: { deliveryLogId?: string },
  ) => {
    if (!id) return;
    const run = ++previewRunRef.current;
    const loadingKey = options?.deliveryLogId
      ? deliveryLogPreviewKey(options.deliveryLogId)
      : step;
    setPreviewStepLoading(loadingKey);
    const dynamicData = extraDynamic
      ? { ...extraDynamic } as Record<string, unknown>
      : undefined;
    try {
      const res = options?.deliveryLogId
        ? await sellService.previewJourneyDeliveryLog(id, options.deliveryLogId)
        : await loadPreview({
          id,
          step,
          payload: dynamicData ? { dynamicData } : {},
        });
      // Ignore stale responses if the user clicked another step’s preview while this was in flight.
      if (run !== previewRunRef.current) return;
      setPreviewSubject(res.subject);
      setPreviewHtml(res.html);
      setPreviewStepKey(res.stepKey ?? step);
      setPreviewOpen(true);
    } catch (e) {
      if (options?.deliveryLogId) toast.error(extractMsg(e));
    } finally {
      if (run === previewRunRef.current) setPreviewStepLoading(null);
    }
  }, [id, loadPreview]);

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (!journey) return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <AlertCircle className="size-10 text-muted-foreground" />
      <p className="text-sm font-medium">Request not found</p>
      <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/sell")}>
        <ArrowLeft className="mr-1.5 size-3.5" /> Back
      </Button>
    </div>
  );

  const done  = JOURNEY_WORKFLOW_STEPS.filter((s) => journeyTimelineStepSent(journey, s)).length;
  const total = JOURNEY_WORKFLOW_STEPS.length;
  const pct   = Math.round((done / total) * 100);
  const isProgressTerminal = ["completed", "cancelled", "no_customer_action"].includes(journey.status);
  const showDeviceReshipRow =
    (journey.sentSteps?.some((s) => s.stepKey === DEVICE_RESHIP_STEP) ?? false) ||
    journey.dynamicData?.closedByReship === true;

  return (
    <>
    <div className="flex h-full flex-col overflow-hidden bg-background">

      {/* ── Top header bar ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => router.push("/dashboard/sell")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" /> SELL
            </button>
            <ChevronRight className="size-3 text-border" />
            <code className="text-[12px] font-bold text-foreground">{journey.requestId}</code>
            <StatusBadge
              status={journey.status as JourneyStatus}
              closedByReship={journey.dynamicData?.closedByReship === true}
            />
            {Boolean(journey.dynamicData?.reminderDue) && !journey.dynamicData?.requestAckByCustomer && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 ring-1 ring-amber-400/30">
                Reminder due
              </span>
            )}
            {journey.offerExpiresAt && journey.status === "active" &&
              new Date(journey.offerExpiresAt) > new Date() && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 ring-1 ring-blue-400/30">
                Offer expires in {formatRelativeExpiry(journey.offerExpiresAt)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0 text-muted-foreground"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
            <motion.div
              className={cn("h-full rounded-full", pct === 100 ? "bg-emerald-500" : isProgressTerminal ? "bg-slate-400" : "bg-primary")}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">{done}/{total}</span>
        </div>
      </div>

      {/* ── 3-column layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: Customer + details ───────────────────────────────────── */}
        <div className="flex w-[260px] shrink-0 flex-col border-r border-border overflow-y-auto scrollbar-thin scrollbar-thumb-border">
          <div className="p-4 space-y-4">

            {/* Customer card */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Customer</p>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[14px] font-bold text-primary">
                  {journey.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground break-words leading-snug">{journey.customerName}</p>
                  <p className="text-[11px] text-muted-foreground break-all leading-snug">{journey.customerEmail}</p>
                </div>
              </div>
            </div>

            {/* Details */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Request Details</p>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-1">
                <EditableField label="Item"   value={String(journey.dynamicData?.deviceName ?? "")}  fieldKey="deviceName"  journeyId={id} />
                <EditableField label="Currency" value={journey.currency}                                fieldKey="currency"    journeyId={id} disabled />
                <EditableField label="Created"  value={formatDateDDMMYY(journey.createdAt)} fieldKey="createdAt" journeyId={id} disabled />
                {Object.entries(journey.dynamicData ?? {})
                  .filter(([k]) => !HIDDEN_JOURNEY_DYNAMIC_KEYS.has(k))
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <EditableField key={k} label={k} value={String(v)} fieldKey={k} journeyId={id} />
                  ))}
              </div>
            </div>

            {/* Pricing highlight — prefers paidAmount > finalOffer > estimated range / legacy estimate */}
            {(() => {
              const dd = journey.dynamicData as Record<string, unknown>;
              const refNo = dd?.paymentReference;
              const highlight = getJourneyMoneyHighlight(dd);
              if (!highlight) return null;
              const sym = CURRENCY_SYMBOL[journey.currency as JourneyCurrency] ?? journey.currency;
              return (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70 mb-1">
                    {highlight.label === "Paid" ? "Paid" : highlight.label === "Offer" ? "Offer" : "Estimated"}
                  </p>
                  <p className="text-[22px] font-extrabold text-primary leading-none">
                    {formatJourneyMoneyDisplay(sym, highlight.display)}
                  </p>
                  {!!refNo && (
                    <p className="text-[10px] text-muted-foreground mt-1">Ref: {String(refNo)}</p>
                  )}
                </div>
              );
            })()}

            {/* Attachments */}
            {((journey.attachments ?? []).length > 0) && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Paperclip className="size-3" /> Attachments
                </p>
                <div className="space-y-1">
                  {(journey.attachments ?? []).map((att: JourneyAttachment) => (
                    <a
                      key={att.storedFilename}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-[11px] hover:bg-muted/40 transition-colors group"
                    >
                      <span className="shrink-0 text-[13px]">
                        {att.mimeType?.includes("pdf") ? "📄" : att.mimeType?.includes("image") ? "🖼️" : "📎"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{att.originalName}</span>
                      <span className="shrink-0 text-muted-foreground text-[10px]">
                        {att.size > 1048576 ? `${(att.size / 1048576).toFixed(1)}MB` : `${Math.round(att.size / 1024)}KB`}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER: Timeline + activity ────────────────────────────────── */}
        <div
          className="flex flex-1 flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-border border-r border-border"
          data-dashboard-primary-scroll=""
        >
          <div className="p-4 space-y-5">

            {/* Journey timeline */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Journey Timeline</p>
              <div className="space-y-0">
                {JOURNEY_WORKFLOW_STEPS.map((step, idx) => (
                  <TimelineStep
                    key={step}
                    stepKey={step}
                    idx={idx}
                    journey={journey}
                    journeyActions={journeyActions}
                    deviceReshipRowFollows={showDeviceReshipRow}
                    onPreviewSentStep={(sk) => {
                      void openEmailPreview(sk);
                    }}
                    previewStepLoading={previewStepLoading}
                    onPreviewDeliveryLog={(logId) => {
                      void openEmailPreview("offer-ready", undefined, { deliveryLogId: logId });
                    }}
                  />
                ))}
                {showDeviceReshipRow ? (
                  <DeviceReshipTimelineRow
                    journey={journey}
                    onPreviewSentStep={(sk) => { void openEmailPreview(sk); }}
                    previewStepLoading={previewStepLoading}
                  />
                ) : null}
              </div>
            </div>

            {/* Customer activity */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="size-3.5 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer Activity</p>
              </div>
              <ActivityFeed journeyId={id} />
            </div>
          </div>
        </div>

        {/* ── RIGHT: Actions + Notes ──────────────────────────────────────── */}
        <div className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-border">
          <div className="flex shrink-0 border-b border-border">
            <button
              onClick={() => setRightTab("actions")}
              className={cn(
                "flex-1 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                rightTab === "actions"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >Actions</button>
            <button
              onClick={() => setRightTab("notes")}
              className={cn(
                "flex-1 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1",
                rightTab === "notes"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <StickyNote className="size-3" />
              Notes
              {(journey.staffNotes?.length ?? 0) > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[9px] font-semibold text-primary">
                  {journey.staffNotes?.length}
                </span>
              )}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border p-4">
            {rightTab === "actions" ? (
              <ActionPanel
                journey={journey}
                id={id}
                onSuccess={handleSuccess}
                previewEmail={openEmailPreview}
                previewBusy={previewLoading}
              />
            ) : (
              <StaffNotesPanel journey={journey} onRefresh={handleSuccess} />
            )}
          </div>
        </div>

      </div>
    </div>

    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent
        showCloseButton
        className={cn(
          SELL_EMAIL_PREVIEW_DIALOG_CLASS,
          "rounded-2xl border border-border bg-card shadow-2xl ring-1 ring-border/50",
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3">
          <DialogTitle className="text-sm font-semibold">Email preview</DialogTitle>
          {previewStepKey ? (
            <p className="text-[11px] font-medium text-foreground">
              {journeyStepLabel(previewStepKey)}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground word-break break-all">{previewSubject}</p>
        </DialogHeader>
        <div className="min-h-0 shrink-0 overflow-hidden p-3">
          <div className={SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS}>
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              sandbox="allow-same-origin"
              className={SELL_EMAIL_PREVIEW_IFRAME_CLASS}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
