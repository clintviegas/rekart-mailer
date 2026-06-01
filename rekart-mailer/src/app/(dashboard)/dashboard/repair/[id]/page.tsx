"use client";

import { useState, useCallback, useRef, Fragment } from "react";
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
  Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MONEY_INPUT_PROPS, parseMoneyInput, isValidMoneyInput } from "@/lib/money-input";
import {
  formatDateDDMMYY,
  formatDateTimeDDMMYY,
  formatPickupDateForEmail,
  parsePickupDateToIso,
} from "@/lib/date-format";
import { REPAIR_RETURN_PAYMENT_METHODS } from "@/lib/repair-payment-methods";
import { REPAIR_QUOTE_REVISE_TYPES, type RepairQuoteReviseType } from "@/lib/repair-quote-decline-reasons";
import {
  isRepairPickupTimeAny,
  parseRepairPickupTimeWindowToHm,
  readCustomerPreferredPickupTimeSlot,
  readCustomerPreferredPickupDate,
} from "@/lib/repair-pickup-time-windows";
import {
  buildRepairServiceCentreOptions,
  normalizeRepairPickUpAddress,
  resolveRepairServiceCentreInitial,
} from "@/lib/repair-service-centres";
import {
  REPAIR_COLLECTION_HOURS_CUSTOM_ID,
  REPAIR_COLLECTION_HOURS_USER_DEFAULT_ID,
  buildCollectionHoursPresetOptions,
  formatCollectionHoursWindow,
  isEffectiveCollectionHoursDefault,
  resolveCollectionHoursInitial,
  writeUserCollectionHoursDefault,
} from "@/lib/repair-collection-hours";
import { toast } from "sonner";
import {
  useSendRepairJourneyStep,
  useResendRepairJourneyStep,
  useRepairJourneyActions,
  useCancelRepairJourney,
  useDeclineQuote,
  useUpdateRepairJourneyData,
  usePreviewJourneyEmail,
  useQuoteEmailLogs,
  useRepairJourney,
} from "@/hooks/use-repair-journeys";
import { repairService } from "@/services/repair.service";
import {
  REPAIR_JOURNEY_WORKFLOW_STEPS,
  REPAIR_JOURNEY_STEP_LABELS,
  repairJourneyStepLabel,
  type RepairJourneyWorkflowStep,
  type RepairRequestJourney,
  type JourneyCurrency,
  type JourneyStatus,
  type RepairJourneyAction,
  type JourneyActionType,
  type JourneyAttachment,
  type RepairQuoteEmailLogItem,
  type StaffNote,
} from "@/types/repair";
import {
  SELL_EMAIL_PREVIEW_DIALOG_CLASS,
  SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS,
  SELL_EMAIL_PREVIEW_IFRAME_CLASS,
} from "@/constants/sell-email-preview";
import {
  formatJourneyMoneyDisplay,
  getJourneyMoneyHighlight,
} from "@/lib/sell-estimated-price";

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
  nextStep: RepairJourneyWorkflowStep | "device-return-unrepaired" | "device-return-unrepaired-complete" | "courier-dispatched";
  Icon: React.FC<{ className?: string }>;
  variant: "primary" | "success";
}

// Before the first email is sent, currentStep stays "booking-confirmed" but completedSteps
// does not yet include it — use this action instead of NEXT_ACTION["booking-confirmed"].
const SEND_BOOKING_EMAIL_ACTION: NextAction = {
  label:       "Send Booking Confirmed Email",
  description: "Send the initial confirmation email to the customer",
  nextStep:    "booking-confirmed",
  Icon:        Send,
  variant:     "primary",
};

// Each entry matches journey.currentStep: nextStep is the EMAIL to send now,
// not the following stage. Backend advances currentStep after each successful send.
const NEXT_ACTION: Partial<Record<RepairJourneyWorkflowStep, NextAction>> = {
  "booking-confirmed": {
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
  "device-received": {
    label:       "Confirm Device Received",
    description: "Notify customer their device arrived at the service centre",
    nextStep:    "device-received",
    Icon:        Package,
    variant:     "primary",
  },
  "diagnosing": {
    label:       "Start Diagnosis",
    description: "Notify customer that diagnosis has begun",
    nextStep:    "diagnosing",
    Icon:        Search,
    variant:     "primary",
  },
  "quote-ready": {
    label:       "Send Quote",
    description: "Enter the repair quote and send to customer",
    nextStep:    "quote-ready",
    Icon:        Wallet,
    variant:     "primary",
  },
  "repair-in-progress": {
    label:       "Start Repair",
    description: "Notify customer that repair work has started",
    nextStep:    "repair-in-progress",
    Icon:        BanknoteIcon,
    variant:     "success",
  },
  "device-ready": {
    label:       "Device Ready",
    description: "Notify customer — they choose collect or courier in the email",
    nextStep:    "device-ready",
    Icon:        BadgeCheck,
    variant:     "success",
  },
  "device-returned": {
    label:       "Send completion email",
    description: "Customer received the device — confirm payment and close the journey",
    nextStep:    "device-returned",
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
  "quoteRoundHistory",
  "quoteAcceptedByCustomer",
  "offerAcceptedAt",
  "quoteAcceptedGeneration",
  "bookingAckByCustomer",
  "bookingAckAcceptedGen",
  "requestAckAcceptedAt",
  "bookingAckDeclined",
  "bookingAckDeclinedGen",
  "bookingAckDeclinedAt",
  "bookingAckGeneration",
  "quoteGeneration",
  "quoteLineItems",
  "quoteDiscounts",
]);

/** Matches backend offer generation (incl. legacy journeys with offer sent but no counter). */
function quoteEffectiveGen(j: RepairRequestJourney): number {
  const og = j.quoteGeneration;
  if (typeof og === "number" && og > 0) return og;
  if (j.completedSteps.includes("quote-ready")) return 1;
  return 0;
}

/** True when customer accepted the current offer round (same generation as latest email). */
function customerAcceptedCurrentQuote(j: RepairRequestJourney): boolean {
  const dd = j.dynamicData as Record<string, unknown> | undefined;
  if (!dd || dd.quoteAcceptedByCustomer !== true) return false;
  const gen = quoteEffectiveGen(j);
  if (gen <= 0) return false;
  const ag = dd.quoteAcceptedGeneration;
  if (typeof ag === "number" && ag > 0) return ag === gen;
  return gen === 1;
}

function bookingAckEffectiveGen(j: RepairRequestJourney): number {
  const g = j.bookingAckGeneration;
  return typeof g === "number" && g > 0 ? g : 0;
}

/** True when customer confirmed the current Booking Confirmed email (signed-link generation). */
function customerAcknowledgedCurrentBooking(j: RepairRequestJourney): boolean {
  const dd = j.dynamicData as Record<string, unknown> | undefined;
  if (!dd || dd.bookingAckByCustomer !== true) return false;
  const gen = bookingAckEffectiveGen(j);
  if (gen <= 0) return false;
  const ag = dd.bookingAckAcceptedGen;
  return typeof ag === "number" && ag > 0 && ag === gen;
}

function QuoteRoundHistoryList({
  journey,
  journeyActions,
  onPreviewDeliveryLog,
  previewBusyKey,
}: {
  journey: RepairRequestJourney;
  journeyActions: RepairJourneyAction[];
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
  const hist = (journey.dynamicData as Record<string, unknown> | undefined)?.quoteRoundHistory;
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
      else if (kind === "customer_declined") {
        const reason = typeof o.declineReason === "string" ? o.declineReason.trim() : "";
        text = `Customer declined${gen != null ? ` · round ${gen}` : ""}${reason ? `: “${reason}”` : ""}`;
      }
      else if (kind === "return_device_requested") text = `Customer requested device return${gen != null ? ` · round ${gen}` : ""}`;
      else text = kind ? kind.replace(/_/g, " ") : "Event";
      lines.push({ at: t, text, sortKey: `${t}-${i}`, deliveryLogId: dl, kind });
    }
  }
  else {
    let i = 0;
    for (const a of journeyActions) {
      if (a.step !== "quote-ready") continue;
      if (a.actionType !== "offer_accepted" && a.actionType !== "quote_declined") continue;
      i += 1;
      const t = new Date(a.createdAt).getTime();
      const gen = (a.payload as Record<string, unknown> | undefined)?.quoteGeneration;
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

function QuoteEmailSendsBlock({
  journeyId,
  onPreviewDeliveryLog,
  previewBusyKey,
}: {
  journeyId: string;
  onPreviewDeliveryLog: (logId: string) => void;
  previewBusyKey: string | null;
}) {
  const { data, isLoading } = useQuoteEmailLogs(journeyId);
  const logs: RepairQuoteEmailLogItem[] = data?.logs ?? [];
  if (isLoading && logs.length === 0) {
    return (
      <p className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> Loading quote email history…
      </p>
    );
  }
  if (logs.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border/40 pt-2 space-y-1">
      <p className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wide">
        Each quote email ({logs.length})
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
                  {log.quoteGeneration != null ? ` (round ${log.quoteGeneration})` : ""}
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

const RESEND_ALLOWED: Set<RepairJourneyWorkflowStep> = new Set([
  "booking-confirmed",
  "pickup-scheduled",
  "device-received",
  "diagnosing",
  "quote-ready",
  "repair-in-progress",
  "device-ready",
  "device-returned",
]);

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<JourneyStatus, { label: string; className: string; dot: string }> = {
  active:        { label: "Active",         className: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",       dot: "bg-blue-500" },
  completed:     { label: "Completed",      className: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800", dot: "bg-emerald-500" },
  cancelled:     { label: "Cancelled",      className: "bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700", dot: "bg-slate-400" },
  quote_declined:{ label: "Quote Declined", className: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",             dot: "bg-red-500" },
  device_return_requested:{ label: "Return Requested", className: "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800", dot: "bg-violet-500" },
  booking_declined: { label: "Booking Declined", className: "bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-950/35 dark:text-orange-300 dark:border-orange-800", dot: "bg-orange-500" },
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
  quote_accepted:       { icon: "✅", label: "Quote Accepted",       color: "text-emerald-700 dark:text-emerald-300" },
  quote_declined:       { icon: "❌", label: "Quote Declined",       color: "text-red-700 dark:text-red-300" },
  booking_confirmed_accepted: { icon: "✅", label: "Booking Confirmed", color: "text-emerald-700 dark:text-emerald-300" },
  booking_confirmed_declined: { icon: "✖️", label: "Booking Declined", color: "text-orange-700 dark:text-orange-300" },
  offer_accepted:       { icon: "✅", label: "Quote Accepted",       color: "text-emerald-700 dark:text-emerald-300" },
  offer_declined:       { icon: "❌", label: "Quote Declined",       color: "text-red-700 dark:text-red-300" },
  request_received_accepted: { icon: "✅", label: "Booking Confirmed", color: "text-emerald-700 dark:text-emerald-300" },
  request_received_declined: { icon: "✖️", label: "Booking Declined", color: "text-orange-700 dark:text-orange-300" },
  receipt_viewed:       { icon: "🧾", label: "Receipt Viewed",       color: "text-teal-700 dark:text-teal-300" },
  rating_submitted:     { icon: "⭐", label: "Rating Submitted",     color: "text-amber-700 dark:text-amber-300" },
  support_requested:    { icon: "💬", label: "Support Requested",    color: "text-indigo-700 dark:text-indigo-300" },
  journey_auto_closed:  { icon: "⏱️", label: "Auto-closed (no response)", color: "text-slate-600 dark:text-slate-400" },
  return_mode_store_selected:   { icon: "🏪", label: "Store pickup chosen",   color: "text-emerald-700 dark:text-emerald-300" },
  return_mode_courier_selected: { icon: "📦", label: "Courier delivery chosen", color: "text-emerald-700 dark:text-emerald-300" },
  return_device_requested:      { icon: "↩️", label: "Device return requested", color: "text-violet-700 dark:text-violet-300" },
};

const STEP_SHORT: Record<string, string> = {
  "booking-confirmed":    "Request",
  "pickup-scheduled":    "Pickup",
  "diagnosing": "Inspection",
  "quote-ready":         "Offer",
  "repair-in-progress":        "Payment",
  "completed":           "Completed",
};

function ActivityFeed({ journeyId }: { journeyId: string }) {
  const { data: actions, isLoading } = useRepairJourneyActions(journeyId);
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
      {actions.map((a: RepairJourneyAction) => {
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
  const { mutate, isPending }  = useUpdateRepairJourneyData();

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

const COURIER_DISPATCH_STEP = "courier-dispatched";

/** Green tick only when an email was actually sent (or legacy completedSteps), never fake payment/completed on reship closes. */
function journeyTimelineStepSent(journey: RepairRequestJourney, stepKey: RepairJourneyWorkflowStep): boolean {
  const closedByReship = journey.dynamicData?.closedByReship === true;
  const hasSent = journey.sentSteps?.some((s) => s.stepKey === stepKey) ?? false;
  const inCompleted = journey.completedSteps.includes(stepKey);
  return (
    hasSent ||
    (inCompleted && !(closedByReship && stepKey === "repair-in-progress"))
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
  stepKey: RepairJourneyWorkflowStep;
  idx: number;
  journey: RepairRequestJourney;
  journeyActions?: RepairJourneyAction[];
  /** When true, the “completed” row keeps a connector down to the device-reship row */
  deviceReshipRowFollows: boolean;
  onPreviewSentStep?: (step: string) => void;
  /** Step key (e.g. `quote-ready`) or `dl:&lt;logId&gt;` while a delivery-log preview loads */
  previewStepLoading?: string | null;
  /** Re-render HTML from a stored offer delivery log */
  onPreviewDeliveryLog?: (logId: string) => void;
}) {
  const sent       = journeyTimelineStepSent(journey, stepKey);
  const quoteDeclined = journey.status === "quote_declined";
  const bookingDeclined = journey.status === "booking_declined";
  const requestAckGen = bookingAckEffectiveGen(journey);
  const customerReturnMode = readRepairReturnMode(journey.dynamicData ?? {});
  const courierDispatchedSent =
    journey.sentSteps?.some((s) => s.stepKey === COURIER_DISPATCH_STEP) ?? false;
  const isCourierReturn =
    customerReturnMode === "courier" && customerSelectedReturnMode(journey);
  let current      = journey.currentStep === stepKey && !sent;
  if (quoteDeclined && (stepKey === "repair-in-progress" || stepKey === "device-returned")) {
    current = false;
  }
  if (stepKey === "device-returned" && isCourierReturn && !courierDispatchedSent) {
    current = false;
  }
  if (
    stepKey === "repair-in-progress" &&
    journey.status === "active" &&
    !customerAcceptedCurrentQuote(journey) &&
    !sent
  ) {
    current = false;
  }
  const needsQuoteRevision = quoteDeclined && stepKey === "quote-ready" && sent;
  const needsBookingRevision = bookingDeclined && stepKey === "booking-confirmed" && sent;
  const awaitingQuoteResponse =
    stepKey === "quote-ready" &&
    sent &&
    journey.status === "active" &&
    !quoteDeclined &&
    !customerAcceptedCurrentQuote(journey);
  const awaitingBookingAck =
    stepKey === "booking-confirmed" &&
    sent &&
    journey.status === "active" &&
    requestAckGen > 0 &&
    !customerAcknowledgedCurrentBooking(journey);
  const bookingAckDone =
    stepKey === "booking-confirmed" &&
    sent &&
    requestAckGen > 0 &&
    customerAcknowledgedCurrentBooking(journey);
  const customerPreferredPickupSlot = readCustomerPreferredPickupTimeSlot(
    journey.dynamicData as Record<string, unknown> | undefined,
  );
  const customerPreferredPickupDate = readCustomerPreferredPickupDate(
    journey.dynamicData as Record<string, unknown> | undefined,
  );
  const future     = !sent && !current;
  const dimmedReturnWaitingDispatch =
    stepKey === "device-returned" && isCourierReturn && !courierDispatchedSent && !sent;
  const record = journey.sentSteps?.find((s) => s.stepKey === stepKey);
  /** Offer step uses per-round Preview in the list — no duplicate timeline eye. */
  const eyePreviewKey = stepKey === "quote-ready" ? null : stepKey;
  const eyeBusy =
    eyePreviewKey != null &&
    previewStepLoading != null &&
    previewStepLoading === eyePreviewKey;
  const last =
    idx === REPAIR_JOURNEY_WORKFLOW_STEPS.length - 1 && !deviceReshipRowFollows;
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
        needsQuoteRevision || needsBookingRevision
          ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 ring-2 ring-amber-400/35"
        : sent    ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400" :
        current && !isTerminal ? "border-primary bg-primary/10 text-primary" :
        "border-border/60 bg-muted/30 text-muted-foreground",
      )}>
        {sent ? <CheckCircle2 className="size-3.5" /> : <span>{idx + 1}</span>}
      </div>

      <div className={cn(
        "mb-1.5 flex flex-1 items-stretch justify-between gap-2 rounded-lg px-3 py-2 border transition-all",
        needsQuoteRevision || needsBookingRevision
          ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/45 dark:bg-amber-950/30 ring-1 ring-amber-300/35"
        : sent    ? "border-emerald-100 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-950/20" :
        current && !isTerminal ? "border-primary/25 bg-primary/5 ring-1 ring-primary/10" :
        dimmedReturnWaitingDispatch ? "border-border/30 bg-transparent opacity-40" :
        "border-border/30 bg-transparent opacity-50",
      )}>
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-[12px] font-semibold",
            future || isTerminal ? "text-muted-foreground" : "text-foreground",
          )}>
            {REPAIR_JOURNEY_STEP_LABELS[stepKey]}
          </p>
          {needsQuoteRevision && (
            <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-400/90 mt-0.5">
              Quote declined — send a revised quote
            </p>
          )}
          {needsBookingRevision && (
            <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-400/90 mt-0.5">
              Customer declined this step — resend Booking Confirmed or cancel the journey
            </p>
          )}
          {awaitingBookingAck && (
            <p className="text-[10px] font-medium text-sky-800 dark:text-sky-400/90 mt-0.5">
              Waiting for customer to use Schedule pickup or Decline in the Booking Confirmed email (round {requestAckGen})
            </p>
          )}
          {bookingAckDone && (
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
          {awaitingQuoteResponse && (
            <p className="text-[10px] font-medium text-sky-800 dark:text-sky-400/90 mt-0.5">
              Waiting for customer to accept or decline this quote
            </p>
          )}
          {stepKey === "quote-ready" && (needsQuoteRevision || sent) && (
            <>
              <QuoteRoundHistoryList
                journey={journey}
                journeyActions={journeyActions}
                onPreviewDeliveryLog={onPreviewDeliveryLog}
                previewBusyKey={previewStepLoading ?? null}
              />
              {sent && onPreviewDeliveryLog ? (
                <QuoteEmailSendsBlock
                  journeyId={journey.id || journey._id}
                  onPreviewDeliveryLog={onPreviewDeliveryLog}
                  previewBusyKey={previewStepLoading ?? null}
                />
              ) : null}
            </>
          )}
          {stepKey === "device-ready" && isCourierReturn && sent && !courierDispatchedSent && (
            <p className="text-[10px] font-medium text-sky-800 dark:text-sky-400/90 mt-0.5">
              Customer chose courier delivery — send dispatch email next
            </p>
          )}
          {stepKey === "device-ready" && customerReturnMode === "store" && sent && (
            <p className="text-[10px] font-medium text-emerald-800 dark:text-emerald-400/90 mt-0.5">
              Customer will collect from store — no courier dispatch
            </p>
          )}
          {dimmedReturnWaitingDispatch && (
            <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
              After courier dispatch is sent
            </p>
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
        {sent && onPreviewSentStep && stepKey !== "quote-ready" ? (
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

/** Courier dispatch — extra timeline row between Device Ready and Device Returned (courier only). */
function CourierDispatchTimelineRow({
  journey,
  onPreviewSentStep,
  previewStepLoading,
}: {
  journey: RepairRequestJourney;
  onPreviewSentStep?: (step: string) => void;
  previewStepLoading?: string | null;
}) {
  const stepKey = COURIER_DISPATCH_STEP;
  const sent = journey.sentSteps?.some((s) => s.stepKey === stepKey) ?? false;
  const deviceReadySent = journeyTimelineStepSent(journey, "device-ready");
  const deviceReturnedSent = journeyTimelineStepSent(journey, "device-returned");
  const current =
    deviceReadySent &&
    !sent &&
    !deviceReturnedSent &&
    journey.currentStep === "device-returned" &&
    journey.status === "active";
  const record = journey.sentSteps?.find((s) => s.stepKey === stepKey);
  const eyeBusy = previewStepLoading === stepKey;
  const dd = journey.dynamicData ?? {};
  const courierName = dynStr(dd, "courierName");
  const trackingNumber = dynStr(dd, "trackingNumber");

  return (
    <div className="relative flex gap-3">
      <div
        className={cn(
          "absolute left-[13px] top-[28px] w-px",
          sent ? "bg-emerald-300 dark:bg-emerald-800" : "bg-border/40",
        )}
        style={{ height: "calc(100% + 4px)" }}
      />
      <div
        className={cn(
          "relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
          sent
            ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
            : current
              ? "border-primary bg-primary/10 text-primary"
              : "border-border/60 bg-muted/30 text-muted-foreground",
        )}
      >
        {sent ? <CheckCircle2 className="size-3.5" /> : <Package className="size-3" />}
      </div>

      <div
        className={cn(
          "mb-1.5 flex flex-1 items-stretch justify-between gap-2 rounded-lg px-3 py-2 border transition-all",
          sent
            ? "border-emerald-100 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-950/20"
            : current
              ? "border-primary/25 bg-primary/5 ring-1 ring-primary/10"
              : "border-border/30 bg-transparent opacity-50",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className={cn("text-[12px] font-semibold", current || sent ? "text-foreground" : "text-muted-foreground")}>
            {repairJourneyStepLabel(stepKey)}
          </p>
          {current ? (
            <p className="text-[10px] font-medium text-sky-800 dark:text-sky-400/90 mt-0.5">
              Fill dispatch details in Actions → send courier email with tracking
            </p>
          ) : null}
          {sent && courierName ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {courierName}
              {trackingNumber ? ` · ${trackingNumber}` : ""}
            </p>
          ) : null}
          {record ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatDateTimeDDMMYY(record.sentAt)}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                  record.deliveryStatus === "sent"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : record.deliveryStatus === "queued"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700",
                )}
              >
                {record.deliveryStatus}
              </span>
            </p>
          ) : null}
        </div>
        {sent && onPreviewSentStep ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 self-center text-muted-foreground hover:text-primary shadow-none focus-visible:ring-0 focus-visible:border-transparent"
            title="Preview courier dispatch email"
            disabled={eyeBusy}
            onClick={() => { void onPreviewSentStep(stepKey); }}
          >
            {eyeBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
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

function readStepCustomMessage(d: Record<string, unknown>, stepKey: string): string {
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
  journey: RepairRequestJourney,
  stepKey: string,
  note: string,
): Record<string, string> {
  const prev = { ...((journey.dynamicData?.customMessages as Record<string, string> | undefined) ?? {}) };
  const t = note.trim();
  if (t) prev[stepKey] = t;
  else delete prev[stepKey];
  return prev;
}

function buildJourneyUpdateWithNote(
  journey: RepairRequestJourney,
  stepKey: string,
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

// ── Pricing modal for quote-ready and repair-in-progress steps ──────────────────────

type QuoteLineItemRow = { id: string; description: string; charge: string };
type QuoteDiscountRow = { id: string; description: string; amount: string };

function newQuoteLineRow(): QuoteLineItemRow {
  return { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, description: "", charge: "" };
}

function newQuoteDiscountRow(): QuoteDiscountRow {
  return { id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, description: "", amount: "" };
}

function parseStoredQuoteLineItems(initial: Record<string, unknown>): QuoteLineItemRow[] {
  const raw = initial.quoteLineItems;
  if (raw == null || raw === "") {
    return [];
  }
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) {
      return [];
    }
    return arr.map((row, i) => {
      const r = row as Record<string, unknown>;
      return {
        id: `q-${i}-${String(r.description ?? r.label ?? "")}`,
        description: String(r.description ?? r.label ?? r.name ?? ""),
        charge: String(r.amount ?? r.charge ?? ""),
      };
    });
  } catch {
    return [];
  }
}

function validQuoteLineItems(rows: QuoteLineItemRow[]): { description: string; amount: string }[] {
  return rows
    .map((row) => ({
      description: row.description.trim(),
      amount: row.charge.trim(),
    }))
    .filter((row) => row.description.length > 0 && isValidMoneyInput(row.amount) && parseMoneyInput(row.amount) > 0);
}

function quoteLineItemsTotal(rows: QuoteLineItemRow[]): number {
  return validQuoteLineItems(rows).reduce((sum, row) => sum + parseMoneyInput(row.amount), 0);
}

function parseStoredQuoteDiscounts(initial: Record<string, unknown>): QuoteDiscountRow[] {
  const raw = initial.quoteDiscounts;
  if (raw == null || raw === "") return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map((row, i) => {
      const r = row as Record<string, unknown>;
      return {
        id: `d-${i}-${String(r.description ?? r.label ?? "")}`,
        description: String(r.description ?? r.label ?? r.name ?? ""),
        amount: String(r.amount ?? r.discount ?? ""),
      };
    });
  } catch {
    return [];
  }
}

function validQuoteDiscounts(rows: QuoteDiscountRow[]): { description: string; amount: string }[] {
  return rows
    .map((row) => ({
      description: row.description.trim(),
      amount: row.amount.trim(),
    }))
    .filter((row) => row.description.length > 0 && isValidMoneyInput(row.amount) && parseMoneyInput(row.amount) > 0);
}

function quoteDiscountsTotal(rows: QuoteDiscountRow[]): number {
  return validQuoteDiscounts(rows).reduce((sum, row) => sum + parseMoneyInput(row.amount), 0);
}

function formatQuoteAmount(amount: number, currencyLabel: string): string {
  return `${currencyLabel} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function QuoteDetailsFormFields({
  expanded,
  currency,
  lineItems,
  discounts,
  repairSummary,
  offerExpiryHours,
  customMessage,
  manualQuoteTotal,
  useManualQuoteTotal,
  quoteSubtotal,
  discountTotal,
  quoteTotal,
  canSend,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  onUpdateDiscountRow,
  onRemoveDiscountRow,
  onAddDiscountRow,
  onRepairSummaryChange,
  onOfferExpiryHoursChange,
  onCustomMessageChange,
  onManualQuoteTotalChange,
}: {
  expanded: boolean;
  currency: string;
  lineItems: QuoteLineItemRow[];
  discounts: QuoteDiscountRow[];
  repairSummary: string;
  offerExpiryHours: string;
  customMessage: string;
  manualQuoteTotal: string;
  useManualQuoteTotal: boolean;
  quoteSubtotal: number;
  discountTotal: number;
  quoteTotal: number;
  canSend: boolean;
  onUpdateRow: (id: string, patch: Partial<Pick<QuoteLineItemRow, "description" | "charge">>) => void;
  onRemoveRow: (id: string) => void;
  onAddRow: () => void;
  onUpdateDiscountRow: (id: string, patch: Partial<Pick<QuoteDiscountRow, "description" | "amount">>) => void;
  onRemoveDiscountRow: (id: string) => void;
  onAddDiscountRow: () => void;
  onRepairSummaryChange: (v: string) => void;
  onOfferExpiryHoursChange: (v: string) => void;
  onCustomMessageChange: (v: string) => void;
  onManualQuoteTotalChange: (v: string) => void;
}) {
  const currencyLabel = CURRENCY_SYMBOL[currency as JourneyCurrency] ?? currency;
  const rowGrid = expanded
    ? "grid-cols-[minmax(0,1fr)_88px_40px]"
    : "grid-cols-[minmax(0,1fr)_72px_28px]";
  const inputClass = expanded
    ? cn(PICKUP_INPUT_CLASS, "py-2 text-[13px]")
    : PICKUP_INPUT_CLASS;
  const hasLineItemRows = lineItems.length > 0;
  const hasLineItems = quoteSubtotal > 0;
  const hasDiscounts = discountTotal > 0;

  return (
    <div className={cn("space-y-3", expanded && "space-y-4")}>
      <div className="space-y-2">
        {hasLineItemRows ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className={cn("font-semibold text-foreground", expanded ? "text-sm" : "text-[11px]")}>
                  Line items <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <p className={cn("text-muted-foreground", expanded ? "text-xs" : "text-[10px]")}>
                  Booking currency: <span className="font-semibold text-foreground">{currencyLabel}</span>
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" className={cn("gap-1", expanded ? "h-8 text-xs" : "h-7 text-[11px]")} onClick={onAddRow}>
                <Plus className="size-3" /> Add item
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className={cn("grid gap-2 bg-muted/40 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground", rowGrid, expanded && "px-4 py-2 text-[11px]")}>
                <span>Part / service</span>
                <span className="text-right">Charge ({currencyLabel})</span>
                <span />
              </div>
              <div className="divide-y divide-border max-h-[min(50vh,420px)] overflow-y-auto">
                {lineItems.map((row) => (
                  <div key={row.id} className={cn("grid gap-2 items-center", rowGrid, expanded ? "px-4 py-3" : "px-2.5 py-2")}>
                    <input
                      type="text"
                      placeholder="e.g. Mic replacement, Labour, PCB repair"
                      value={row.description}
                      onChange={(e) => onUpdateRow(row.id, { description: e.target.value })}
                      className={cn(inputClass, "min-w-0 w-full")}
                    />
                    <input
                      {...MONEY_INPUT_PROPS}
                      placeholder="0"
                      value={row.charge}
                      onChange={(e) => onUpdateRow(row.id, { charge: e.target.value })}
                      className={cn(inputClass, "w-full min-w-0 text-right tabular-nums px-1.5")}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={cn("shrink-0 text-muted-foreground hover:text-destructive", expanded ? "size-8" : "size-7")}
                      onClick={() => onRemoveRow(row.id)}
                      aria-label="Remove line item"
                    >
                      <Trash2 className={expanded ? "size-4" : "size-3.5"} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5">
            <p className={cn("text-muted-foreground leading-relaxed", expanded ? "text-xs" : "text-[10px]")}>
              No part breakdown — skip if nothing changed. Add items only when you need to list parts or services.
            </p>
            <Button type="button" size="sm" variant="outline" className={cn("shrink-0 gap-1", expanded ? "h-8 text-xs" : "h-7 text-[11px]")} onClick={onAddRow}>
              <Plus className="size-3" /> Add item
            </Button>
          </div>
        )}

        {hasLineItemRows ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className={cn("font-semibold text-foreground", expanded ? "text-sm" : "text-[11px]")}>Discounts</p>
              <p className={cn("text-muted-foreground", expanded ? "text-xs" : "text-[10px]")}>
                Optional — subtract from subtotal
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" className={cn("gap-1", expanded ? "h-8 text-xs" : "h-7 text-[11px]")} onClick={onAddDiscountRow}>
              <Plus className="size-3" /> Add discount
            </Button>
          </div>
          {discounts.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className={cn("grid gap-2 bg-muted/40 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground", rowGrid, expanded && "px-4 py-2 text-[11px]")}>
                <span>Discount</span>
                <span className="text-right">Amount ({currencyLabel})</span>
                <span />
              </div>
              <div className="divide-y divide-border max-h-[min(40vh,280px)] overflow-y-auto">
                {discounts.map((row) => (
                  <div key={row.id} className={cn("grid gap-2 items-center", rowGrid, expanded ? "px-4 py-3" : "px-2.5 py-2")}>
                    <input
                      type="text"
                      placeholder="e.g. Loyalty discount, Festival offer"
                      value={row.description}
                      onChange={(e) => onUpdateDiscountRow(row.id, { description: e.target.value })}
                      className={cn(inputClass, "min-w-0 w-full")}
                    />
                    <input
                      {...MONEY_INPUT_PROPS}
                      placeholder="0"
                      value={row.amount}
                      onChange={(e) => onUpdateDiscountRow(row.id, { amount: e.target.value })}
                      className={cn(inputClass, "w-full min-w-0 text-right tabular-nums px-1.5")}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={cn("shrink-0 text-muted-foreground hover:text-destructive", expanded ? "size-8" : "size-7")}
                      onClick={() => onRemoveDiscountRow(row.id)}
                      aria-label="Remove discount"
                    >
                      <Trash2 className={expanded ? "size-4" : "size-3.5"} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className={cn("text-muted-foreground leading-relaxed rounded-lg border border-dashed border-border px-3 py-2", expanded ? "text-xs" : "text-[10px]")}>
              No discounts added. Tap <strong className="text-foreground">Add discount</strong> for multiple offers (e.g. loyalty, coupon).
            </p>
          )}
        </div>
        ) : null}

        <div className={cn("space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2", expanded && "px-4 py-3 space-y-2")}>
          {useManualQuoteTotal ? (
            <div>
              <label className={cn("block font-semibold text-muted-foreground mb-1", expanded ? "text-sm" : "text-[11px]")}>
                Quote total ({currencyLabel})
              </label>
              <input
                {...MONEY_INPUT_PROPS}
                placeholder="Enter quote amount"
                value={manualQuoteTotal}
                onChange={(e) => onManualQuoteTotalChange(e.target.value)}
                className={cn(inputClass, "max-w-[200px] tabular-nums")}
              />
            </div>
          ) : (
            <>
              {hasLineItems && hasDiscounts ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className={cn("text-muted-foreground", expanded ? "text-sm" : "text-[11px]")}>Subtotal</span>
                    <span className={cn("font-medium text-foreground tabular-nums", expanded ? "text-sm" : "text-[12px]")}>
                      {formatQuoteAmount(quoteSubtotal, currencyLabel)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn("text-muted-foreground", expanded ? "text-sm" : "text-[11px]")}>Discounts</span>
                    <span className={cn("font-medium text-emerald-600 dark:text-emerald-400 tabular-nums", expanded ? "text-sm" : "text-[12px]")}>
                      − {formatQuoteAmount(discountTotal, currencyLabel)}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between">
                <span className={cn("font-semibold text-muted-foreground", expanded ? "text-sm" : "text-[11px]")}>Quote total</span>
                <span className={cn("font-bold text-primary tabular-nums", expanded ? "text-xl" : "text-[15px]")}>
                  {canSend ? formatQuoteAmount(quoteTotal, currencyLabel) : "—"}
                </span>
              </div>
            </>
          )}
        </div>
        <p className={cn("text-muted-foreground leading-relaxed", expanded ? "text-xs" : "text-[10px]")}>
          {hasLineItemRows
            ? "Add each repair part or service separately — e.g. screen, battery, labour, visit charge. Discounts are subtracted from the subtotal automatically."
            : "Enter the quote total directly, or add line items if you want a part-by-part breakdown in the email."}
        </p>
        {hasLineItemRows && hasLineItems && hasDiscounts && quoteTotal <= 0 ? (
          <p className={cn("text-destructive font-medium", expanded ? "text-xs" : "text-[10px]")}>
            Discounts cannot exceed the subtotal — reduce discount amounts to send the quote.
          </p>
        ) : null}
      </div>

      <div>
        <label className={cn("block text-muted-foreground mb-1", expanded ? "text-xs" : "text-[11px]")}>
          Work included / Diagnosis summary <span className="text-[10px] opacity-60">(optional)</span>
        </label>
        <textarea
          placeholder="e.g. Mic is not working and speaker too"
          rows={expanded ? 4 : 3}
          value={repairSummary}
          onChange={(e) => onRepairSummaryChange(e.target.value)}
          className={cn(
            "w-full resize-y rounded border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary",
            expanded ? "min-h-[100px] text-[13px]" : "min-h-[72px] text-[12px]",
          )}
        />
      </div>

      <div>
        <label className={cn("block text-muted-foreground mb-1", expanded ? "text-xs" : "text-[11px]")}>Quote valid for (hours)</label>
        <input
          type="number" min="1" max="168"
          value={offerExpiryHours}
          onChange={(e) => onOfferExpiryHoursChange(e.target.value)}
          className={cn("w-full rounded border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary", expanded ? "max-w-[200px] text-[13px]" : "text-[12px]")}
        />
      </div>
      <StepCustomMessageField value={customMessage} onChange={onCustomMessageChange} />
    </div>
  );
}

function OfferDataModal({
  onConfirm, onCancel, onPreview, currency, initial = {}, stepKey,
  isReviseAfterDecline = false,
  declineReason = "",
}: {
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
  currency: string;
  initial?: Record<string, unknown>;
  stepKey: RepairJourneyWorkflowStep;
  isReviseAfterDecline?: boolean;
  declineReason?: string;
}) {
  const [lineItems, setLineItems] = useState<QuoteLineItemRow[]>(() => parseStoredQuoteLineItems(initial));
  const [discounts, setDiscounts] = useState<QuoteDiscountRow[]>(() => parseStoredQuoteDiscounts(initial));
  const [manualQuoteTotal, setManualQuoteTotal] = useState(() => {
    const saved = dynStr(initial, "quoteAmount") || dynStr(initial, "finalOffer");
    const storedItems = parseStoredQuoteLineItems(initial);
    if (validQuoteLineItems(storedItems).length === 0 && saved) return saved;
    return "";
  });
  const [repairSummary, setRepairSummary] = useState(() => dynStr(initial, "repairSummary"));
  const [offerExpiryHours, setOfferExpiryHours] = useState(() => dynStr(initial, "offerExpiryHours") || "48");
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));
  const [quoteReviseType, setQuoteReviseType] = useState<RepairQuoteReviseType>(
    () => (dynStr(initial, "quoteReviseType") as RepairQuoteReviseType) || "after_reason",
  );
  const [expanded, setExpanded] = useState(false);

  const parsedItems = validQuoteLineItems(lineItems);
  const parsedDiscounts = validQuoteDiscounts(discounts);
  const quoteSubtotal = quoteLineItemsTotal(lineItems);
  const discountTotal = quoteDiscountsTotal(discounts);
  const useManualQuoteTotal = parsedItems.length === 0;
  const manualTotalNum = parseMoneyInput(manualQuoteTotal);
  const quoteTotal = useManualQuoteTotal
    ? (Number.isFinite(manualTotalNum) ? manualTotalNum : 0)
    : quoteSubtotal - discountTotal;
  const canSend = useManualQuoteTotal
    ? Number.isFinite(manualTotalNum) && manualTotalNum > 0
    : parsedItems.length > 0 && quoteTotal > 0;

  function updateRow(id: string, patch: Partial<Pick<QuoteLineItemRow, "description" | "charge">>) {
    setLineItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setLineItems((prev) => {
      const next = prev.filter((row) => row.id !== id);
      if (next.length === 0 && prev.length > 0) {
        const sub = quoteLineItemsTotal(prev);
        const disc = quoteDiscountsTotal(discounts);
        const total = sub - disc;
        if (total > 0) setManualQuoteTotal(String(total));
        setDiscounts([]);
      }
      return next;
    });
  }

  function addRow() {
    setLineItems((prev) => (prev.length === 0 ? [newQuoteLineRow()] : [...prev, newQuoteLineRow()]));
  }

  function updateDiscountRow(id: string, patch: Partial<Pick<QuoteDiscountRow, "description" | "amount">>) {
    setDiscounts((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeDiscountRow(id: string) {
    setDiscounts((prev) => prev.filter((row) => row.id !== id));
  }

  function addDiscountRow() {
    setDiscounts((prev) => [...prev, newQuoteDiscountRow()]);
  }

  function payload(): Record<string, string> {
    const items = validQuoteLineItems(lineItems);
    const discountRows = validQuoteDiscounts(discounts);
    const subtotal = quoteLineItemsTotal(lineItems);
    const discountsSum = quoteDiscountsTotal(discounts);
    const total = items.length > 0
      ? subtotal - discountsSum
      : parseMoneyInput(manualQuoteTotal);
    const totalStr = items.length > 0 ? String(total) : manualQuoteTotal.trim();
    return {
      quoteLineItems: items.length > 0
        ? JSON.stringify(items.map((row) => ({ description: row.description, amount: row.amount })))
        : "",
      quoteDiscounts: discountRows.length > 0
        ? JSON.stringify(discountRows.map((row) => ({ description: row.description, amount: row.amount })))
        : "",
      repairSummary: repairSummary.trim(),
      finalOffer: totalStr,
      quoteAmount: totalStr,
      offerAmount: totalStr,
      offerExpiryHours: offerExpiryHours.trim(),
      customMessage: customMessage.trim(),
      ...(isReviseAfterDecline ? { quoteReviseType, quoteDeclineReason: declineReason.trim() } : {}),
    };
  }

  const formFieldsProps = {
    currency,
    lineItems,
    discounts,
    repairSummary,
    offerExpiryHours,
    customMessage,
    manualQuoteTotal,
    useManualQuoteTotal,
    quoteSubtotal,
    discountTotal,
    quoteTotal,
    canSend,
    onUpdateRow: updateRow,
    onRemoveRow: removeRow,
    onAddRow: addRow,
    onUpdateDiscountRow: updateDiscountRow,
    onRemoveDiscountRow: removeDiscountRow,
    onAddDiscountRow: addDiscountRow,
    onRepairSummaryChange: setRepairSummary,
    onOfferExpiryHoursChange: setOfferExpiryHours,
    onCustomMessageChange: setCustomMessage,
    onManualQuoteTotalChange: setManualQuoteTotal,
  };

  const actionButtons = (size: "compact" | "expanded") => (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        size="sm"
        variant="outline"
        className={cn("flex-1 min-w-[100px] text-xs", size === "expanded" && "h-9")}
        onClick={() => {
          setExpanded(false);
          onCancel();
        }}
      >
        Cancel
      </Button>
      {onPreview && (
        <Button
          size="sm"
          variant="secondary"
          className={cn("flex-1 min-w-[100px] gap-1 text-xs", size === "expanded" && "h-9")}
          disabled={!canSend}
          onClick={() => onPreview(payload())}
        >
          <Eye className="size-3" /> Preview
        </Button>
      )}
      <Button
        size="sm"
        className={cn("flex-1 min-w-[100px] text-xs", size === "expanded" && "h-9")}
        disabled={!canSend}
        onClick={() => {
          setExpanded(false);
          onConfirm(payload());
        }}
      >
        Send Quote
      </Button>
    </div>
  );

  return (
    <>
      <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quote Details</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="size-3.5" />
            Expand
          </Button>
        </div>
        {isReviseAfterDecline ? (
          <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
            {declineReason ? (
              <p className="text-[11px] leading-relaxed text-amber-950 dark:text-amber-100">
                Customer reason: <strong>{declineReason}</strong>
              </p>
            ) : null}
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Revised email type</p>
            <div className="space-y-1.5">
              {REPAIR_QUOTE_REVISE_TYPES.map((opt) => (
                <label key={opt.value} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2">
                  <input
                    type="radio"
                    name="quoteReviseType"
                    value={opt.value}
                    checked={quoteReviseType === opt.value}
                    onChange={() => setQuoteReviseType(opt.value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-foreground">{opt.label}</span>
                    <span className="block text-[10px] text-muted-foreground leading-snug">{opt.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <QuoteDetailsFormFields expanded={false} {...formFieldsProps} />
        {actionButtons("compact")}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent showCloseButton={false} className="flex max-h-[min(92vh,880px)] w-[min(96vw,720px)] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-0 border-b px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-base font-semibold">Quote Details</DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add line items and review the full quote before sending to the customer.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1.5 text-xs"
                onClick={() => setExpanded(false)}
              >
                <Minimize2 className="size-3.5" />
                Close
              </Button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <QuoteDetailsFormFields expanded {...formFieldsProps} />
          </div>
          <div className="shrink-0 border-t bg-muted/20 px-5 py-4">
            {actionButtons("expanded")}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RepairInProgressModal({
  onConfirm, onCancel, onPreview, initial = {}, stepKey,
}: {
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
  initial?: Record<string, unknown>;
  stepKey: RepairJourneyWorkflowStep;
}) {
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState(() =>
    parsePickupDateToIso(dynStr(initial, "estimatedCompletionDate")),
  );
  const [repairNotes, setRepairNotes] = useState(() => dynStr(initial, "repairNotes"));
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));
  const completionLabel = formatPickupDateForEmail(estimatedCompletionDate);
  const canPreview = Boolean(completionLabel || repairNotes.trim());

  function payload(): Record<string, string> {
    return {
      estimatedCompletionDate: completionLabel,
      repairNotes: repairNotes.trim(),
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Repair Details</p>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Estimated completion date</label>
        <input
          type="date"
          value={estimatedCompletionDate}
          onChange={(e) => setEstimatedCompletionDate(e.target.value)}
          className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
        />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Repair notes <span className="text-[10px] opacity-60">(optional)</span></label>
        <textarea
          placeholder="e.g. Screen replacement in progress, parts ordered…"
          rows={2}
          value={repairNotes}
          onChange={(e) => setRepairNotes(e.target.value)}
          className={cn(PICKUP_INPUT_CLASS, "min-h-[72px] resize-y")}
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
          size="sm" className="h-7 flex-1 min-w-[100px] text-xs"
          onClick={() => onConfirm(payload())}
        >
          Start Repair
        </Button>
      </div>
    </div>
  );
}

type RepairReturnMode = "store" | "courier";

function readRepairReturnMode(initial: Record<string, unknown>): RepairReturnMode | null {
  const raw = dynStr(initial, "returnMode").trim().toLowerCase();
  if (raw === "courier") return "courier";
  if (raw === "store") return "store";
  return null;
}

function customerSelectedReturnMode(j: RepairRequestJourney): boolean {
  const dd = j.dynamicData as Record<string, unknown> | undefined;
  if (!dd) return false;
  const mode = String(dd.returnMode ?? "").trim().toLowerCase();
  return mode === "store" || mode === "courier";
}

function repairReturnModeLabel(mode: RepairReturnMode): string {
  return mode === "courier" ? "Courier delivery" : "Collect from our store";
}

/** Resend list — main completed steps plus courier dispatch (from sentSteps, courier only). */
function buildResendableStepKeys(journey: RepairRequestJourney): string[] {
  const sent = new Set((journey.sentSteps ?? []).map((s) => s.stepKey));
  const completed = new Set(journey.completedSteps);
  const isCourier = readRepairReturnMode(journey.dynamicData ?? {}) === "courier";
  const keys: string[] = [];

  for (const step of REPAIR_JOURNEY_WORKFLOW_STEPS) {
    if (completed.has(step) && RESEND_ALLOWED.has(step)) {
      keys.push(step);
    }
    if (step === "device-ready" && isCourier && sent.has(COURIER_DISPATCH_STEP)) {
      keys.push(COURIER_DISPATCH_STEP);
    }
  }
  return keys;
}

/** Device ready — ready date and store address (customer chooses return mode in email). */
function DeviceReadyDataModal({
  onConfirm,
  onCancel,
  onPreview,
  initial = {},
  currency,
  stepKey,
}: {
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
  initial?: Record<string, unknown>;
  currency: string;
  stepKey: RepairJourneyWorkflowStep;
}) {
  const savedAddress =
    dynStr(initial, "collectionAddress") ||
    dynStr(initial, "diagnosisCenter") ||
    dynStr(initial, "inspectionCenter");
  const centreOptions = buildRepairServiceCentreOptions(currency, savedAddress);
  const [readyDateIso, setReadyDateIso] = useState(() =>
    parsePickupDateToIso(dynStr(initial, "readyDate")),
  );
  const [collectionAddress, setCollectionAddress] = useState(() =>
    resolveRepairServiceCentreInitial(savedAddress, currency),
  );
  const savedCollectionHours = dynStr(initial, "collectionHours");
  const initialCollection = resolveCollectionHoursInitial(savedCollectionHours);
  const [collectionPresetId, setCollectionPresetId] = useState(() => initialCollection.presetId);
  const [collectionTimeFrom, setCollectionTimeFrom] = useState(() => initialCollection.from);
  const [collectionTimeTo, setCollectionTimeTo] = useState(() => initialCollection.to);
  const [presetOptionsVersion, setPresetOptionsVersion] = useState(0);
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const readyDateLabel = formatPickupDateForEmail(readyDateIso);
  const collectionHoursLabel = formatCollectionHoursWindow(collectionTimeFrom, collectionTimeTo);
  const collectionFromM = timeHmToMinutes(collectionTimeFrom);
  const collectionToM = timeHmToMinutes(collectionTimeTo);
  const collectionWindowOk =
    collectionTimeFrom.length > 0 &&
    collectionTimeTo.length > 0 &&
    Number.isFinite(collectionFromM) &&
    Number.isFinite(collectionToM) &&
    collectionToM > collectionFromM;
  const canSend =
    readyDateIso.length > 0 &&
    Boolean(readyDateLabel) &&
    collectionAddress.trim().length > 0 &&
    collectionWindowOk &&
    Boolean(collectionHoursLabel);

  function applyCollectionPreset(presetId: string) {
    const preset = buildCollectionHoursPresetOptions().find((p) => p.id === presetId);
    setCollectionPresetId(presetId);
    if (preset && presetId !== REPAIR_COLLECTION_HOURS_CUSTOM_ID) {
      setCollectionTimeFrom(preset.from);
      setCollectionTimeTo(preset.to);
    }
  }

  function handleMakeCollectionHoursDefault() {
    if (!collectionWindowOk) return;
    writeUserCollectionHoursDefault(collectionTimeFrom, collectionTimeTo);
    setCollectionPresetId(REPAIR_COLLECTION_HOURS_USER_DEFAULT_ID);
    setPresetOptionsVersion((v) => v + 1);
    toast.success("Store collection hours saved as your default");
  }

  const showCustomCollectionTimes = collectionPresetId === REPAIR_COLLECTION_HOURS_CUSTOM_ID;
  const canMakeCollectionDefault =
    collectionWindowOk && !isEffectiveCollectionHoursDefault(collectionTimeFrom, collectionTimeTo);

  function payload(): Record<string, string> {
    return {
      readyDate: readyDateLabel,
      collectionAddress: normalizeRepairPickUpAddress(collectionAddress.trim()),
      collectionHours: collectionHoursLabel,
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-emerald-300/80 bg-card p-4 space-y-3 dark:border-emerald-800/50">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Device ready</p>
      <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-[11px] leading-relaxed text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100">
        Customer will choose <strong>Collect from store</strong> or <strong>Courier delivery</strong> from buttons in the email.
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Ready on</label>
        <input
          type="date"
          value={readyDateIso}
          onChange={(e) => setReadyDateIso(e.target.value)}
          className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Pick up address</label>
        <select
          value={collectionAddress}
          onChange={(e) => setCollectionAddress(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        >
          {centreOptions.map((centre) => (
            <option key={centre.id} value={centre.address}>
              {centre.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Options for <span className="font-medium text-foreground">{currency}</span>. Default is the store location (collect from store).
        </p>
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Store collection hours</label>
        <select
          key={presetOptionsVersion}
          value={collectionPresetId}
          onChange={(e) => applyCollectionPreset(e.target.value)}
          className={cn(PICKUP_INPUT_CLASS, "mb-2")}
        >
          {buildCollectionHoursPresetOptions().map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        {showCustomCollectionTimes ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-0.5 block text-[10px] text-muted-foreground/90">From</span>
              <input
                type="time"
                value={collectionTimeFrom}
                onChange={(e) => {
                  setCollectionPresetId(REPAIR_COLLECTION_HOURS_CUSTOM_ID);
                  setCollectionTimeFrom(e.target.value);
                }}
                className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
              />
            </div>
            <div>
              <span className="mb-0.5 block text-[10px] text-muted-foreground/90">To</span>
              <input
                type="time"
                value={collectionTimeTo}
                onChange={(e) => {
                  setCollectionPresetId(REPAIR_COLLECTION_HOURS_CUSTOM_ID);
                  setCollectionTimeTo(e.target.value);
                }}
                className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
              />
            </div>
          </div>
        ) : null}
        {collectionHoursLabel && collectionWindowOk ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Customer sees:{" "}
            <span className="font-medium text-foreground">{collectionHoursLabel}</span>
          </p>
        ) : null}
        {canMakeCollectionDefault ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-[11px]"
            onClick={handleMakeCollectionHoursDefault}
          >
            Make it default
          </Button>
        ) : null}
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
          Send device ready email
        </Button>
      </div>
    </div>
  );
}

/** HH:mm (24-panel) → e.g. "2:00 PM" */
function formatTime12Short(isoHm: string): string {
  const [hh, mm] = isoHm.split(":").map((x) => Number(x));
  if (Number.isNaN(hh)) return "";
  const dt = new Date(2000, 0, 1, hh, mm || 0);
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function padHm(h: string, mi: string): string {
  return `${h.padStart(2, "0")}:${mi.padStart(2, "0")}`;
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

function parse12hPartToHm(part: string): string {
  const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";
  let h = Number(m[1]);
  const mi = m[2];
  const ap = m[3].toUpperCase();
  if (Number.isNaN(h)) return "";
  if (h === 12) h = ap === "AM" ? 0 : 12;
  else if (ap === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${mi}`;
}

/** Parse stored collection/pickup window (12h email label or 24h saved pair). */
function splitCollectionHoursWindow(saved: string): { from: string; to: string } {
  const s = saved.trim();
  if (!s) return { from: "10:00", to: "21:00" };
  if (/AM|PM/i.test(s)) {
    const parts = s.split(/\s*[–-]\s*/);
    if (parts.length === 2) {
      const from = parse12hPartToHm(parts[0]);
      const to = parse12hPartToHm(parts[1]);
      if (from && to) return { from, to };
    }
  }
  const hm = splitSavedTimeWindow(s);
  if (hm.from && hm.to) return hm;
  return { from: "10:00", to: "21:00" };
}

/** Pickup step: fields map to `dynamicData` keys used in `email-html.renderer` (pickup-scheduled). */
function PickupDataModal({
  onConfirm, onCancel, onPreview, initial, stepKey,
}: {
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
  initial: Record<string, unknown>;
  stepKey: RepairJourneyWorkflowStep;
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

/** First email — fields match booking-confirmed table in `email-html.renderer`. */
function RequestReceivedDataModal({
  initial, currency, onConfirm, onCancel, onPreview, stepKey,
}: {
  initial: Record<string, unknown>;
  currency: string;
  stepKey: RepairJourneyWorkflowStep;
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
  const [dateIso, setDateIso] = useState(() => parsePickupDateToIso(dynStr(initial, "requestDate")));
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const requestDateLabel = formatPickupDateForEmail(dateIso);
  const canSend =
    deviceName.trim().length > 0 &&
    dateIso.length > 0 &&
    Boolean(requestDateLabel);

  function payload(): Record<string, string> {
    const o: Record<string, string> = {
      deviceName: deviceName.trim(),
      deviceBrand: deviceBrand.trim(),
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

/** Diagnosing step — technician, service centre, and est. completion for email table. */
function InspectionDataModal({
  initial, currency, onConfirm, onCancel, onPreview, stepKey,
}: {
  initial: Record<string, unknown>;
  currency: string;
  stepKey: RepairJourneyWorkflowStep;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
}) {
  const savedCentre =
    dynStr(initial, "diagnosisCenter") || dynStr(initial, "inspectionCenter");
  const centreOptions = buildRepairServiceCentreOptions(currency, savedCentre);
  const [technicianName, setTechnicianName] = useState(() =>
    dynStr(initial, "technicianName") || dynStr(initial, "inspectorName"),
  );
  const [diagnosisCenter, setDiagnosisCenter] = useState(() =>
    resolveRepairServiceCentreInitial(savedCentre, currency),
  );
  const [estimatedDiagnosisDate, setEstimatedDiagnosisDate] = useState(() =>
    dynStr(initial, "estimatedDiagnosisDate") || dynStr(initial, "estimatedCompletion"),
  );
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const canSend =
    technicianName.trim().length > 0 &&
    diagnosisCenter.trim().length > 0 &&
    estimatedDiagnosisDate.trim().length > 0;

  function payload(): Record<string, string> {
    return {
      technicianName: technicianName.trim(),
      diagnosisCenter: normalizeRepairPickUpAddress(diagnosisCenter.trim()),
      estimatedDiagnosisDate: estimatedDiagnosisDate.trim(),
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-amber-200/80 bg-card p-4 space-y-3 dark:border-amber-900/40">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Diagnosis notice</p>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Technician name</label>
        <input
          type="text"
          placeholder="Technician assigned to this device"
          value={technicianName}
          onChange={(e) => setTechnicianName(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Service centre</label>
        <select
          value={diagnosisCenter}
          onChange={(e) => setDiagnosisCenter(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        >
          {centreOptions.map((centre) => (
            <option key={centre.id} value={centre.address}>
              {centre.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Options for <span className="font-medium text-foreground">{currency}</span>. Default is the store location (collect from store).
        </p>
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Est. diagnosis complete</label>
        <input
          type="text"
          placeholder="e.g. 22/05/26 or 2–3 business days"
          value={estimatedDiagnosisDate}
          onChange={(e) => setEstimatedDiagnosisDate(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Shown in email as <span className="font-medium text-foreground">Est. Complete</span>
        </p>
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
          Send diagnosis email
        </Button>
      </div>
    </div>
  );
}

/** Device received at service centre — intake fields for email table. */
function DeviceReceivedDataModal({
  initial, onConfirm, onCancel, onPreview, stepKey,
}: {
  initial: Record<string, unknown>;
  stepKey: RepairJourneyWorkflowStep;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
}) {
  const readReceived = () => {
    const raw = dynStr(initial, "receivedAt");
    if (!raw) return { dateIso: new Date().toISOString().slice(0, 10), timeHm: "" };
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      return { dateIso: isoMatch[1], timeHm: splitSavedTimeWindow(raw).from };
    }
    const parsed = parsePickupDateToIso(raw);
    const timeMatch = raw.match(/(\d{1,2}:\d{2})\s*(?:[AP]M)?/i);
    let timeHm = "";
    if (timeMatch) {
      const [h, mi] = timeMatch[1].split(":").map((x) => Number(x));
      if (!Number.isNaN(h)) timeHm = `${String(h).padStart(2, "0")}:${String(mi || 0).padStart(2, "0")}`;
    }
    return { dateIso: parsed || new Date().toISOString().slice(0, 10), timeHm };
  };

  const initialReceived = readReceived();
  const [receivedBy, setReceivedBy] = useState(() =>
    dynStr(initial, "receivedBy") || dynStr(initial, "inspectorName"),
  );
  const [dateIso, setDateIso] = useState(initialReceived.dateIso);
  const [timeHm, setTimeHm] = useState(initialReceived.timeHm);
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const dateLabel = formatPickupDateForEmail(dateIso);
  const receivedAtLabel = dateLabel
    ? timeHm
      ? `${dateLabel} · ${formatTime12Short(timeHm)}`
      : dateLabel
    : "";

  const canSend = receivedBy.trim().length > 0 && dateIso.length > 0 && Boolean(receivedAtLabel);

  function payload(): Record<string, string> {
    return {
      receivedBy: receivedBy.trim(),
      receivedAt: receivedAtLabel,
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-indigo-200/80 bg-card p-4 space-y-3 dark:border-indigo-900/40">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Device intake</p>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Received by</label>
        <input
          type="text"
          placeholder="Staff name at service centre"
          value={receivedBy}
          onChange={(e) => setReceivedBy(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">Received date</label>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Received time <span className="text-[10px] opacity-60">(optional)</span>
          </label>
          <input
            type="time"
            value={timeHm}
            onChange={(e) => setTimeHm(e.target.value)}
            className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
          />
        </div>
      </div>
      {receivedAtLabel ? (
        <p className="text-[10px] text-muted-foreground">
          Email “Received on”: <span className="font-medium text-foreground">{receivedAtLabel}</span>
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
        <Button size="sm" className="h-7 min-w-[100px] flex-1 bg-indigo-600 text-xs text-white hover:bg-indigo-700" disabled={!canSend} onClick={() => onConfirm(payload())}>
          Send device received email
        </Button>
      </div>
    </div>
  );
}

/** Journey completed — summary fields for completed step email. */
function ReturnWithoutRepairModal({
  stepKey,
  initial,
  onConfirm,
  onCancel,
  onPreview,
}: {
  stepKey: "device-return-unrepaired" | "device-return-unrepaired-complete";
  initial: Record<string, unknown>;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
}) {
  const isComplete = stepKey === "device-return-unrepaired-complete";
  const [returnMethod, setReturnMethod] = useState(() => dynStr(initial, "returnMethod"));
  const [courierName, setCourierName] = useState(() => dynStr(initial, "courierName"));
  const [trackingNumber, setTrackingNumber] = useState(() => dynStr(initial, "trackingNumber"));
  const [trackingUrl, setTrackingUrl] = useState(() => dynStr(initial, "trackingUrl"));
  const [expectedReturnDate, setExpectedReturnDate] = useState(() =>
    parsePickupDateToIso(dynStr(initial, "expectedReturnDate")),
  );
  const [returnedDate, setReturnedDate] = useState(() =>
    parsePickupDateToIso(dynStr(initial, "returnedDate", "completionDate")),
  );
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const expectedLabel = formatPickupDateForEmail(expectedReturnDate);
  const returnedLabel = formatPickupDateForEmail(returnedDate);
  const canSend = isComplete ? returnedDate.length > 0 && Boolean(returnedLabel) : returnMethod.trim().length > 0;

  function payload(): Record<string, string> {
    if (isComplete) {
      return {
        returnedDate: returnedLabel,
        customMessage: customMessage.trim(),
      };
    }
    return {
      returnMethod: returnMethod.trim(),
      courierName: courierName.trim(),
      trackingNumber: trackingNumber.trim(),
      trackingUrl: trackingUrl.trim(),
      expectedReturnDate: expectedLabel,
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-violet-300/80 bg-card p-4 space-y-3 dark:border-violet-800/50">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {isComplete ? "Return complete" : "Device return (no repair)"}
      </p>
      {!isComplete ? (
        <>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Return method</label>
            <input
              type="text"
              placeholder="e.g. Courier to customer address"
              value={returnMethod}
              onChange={(e) => setReturnMethod(e.target.value)}
              className={PICKUP_INPUT_CLASS}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Expected return date <span className="opacity-60">(optional)</span></label>
            <input
              type="date"
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
              className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Courier name <span className="opacity-60">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Aramex, DHL"
              value={courierName}
              onChange={(e) => setCourierName(e.target.value)}
              className={PICKUP_INPUT_CLASS}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Tracking number <span className="opacity-60">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. AWB123456789"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className={PICKUP_INPUT_CLASS}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Tracking link <span className="opacity-60">(optional)</span></label>
            <input
              type="url"
              placeholder="https://courier.com/track/..."
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              className={PICKUP_INPUT_CLASS}
            />
            <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
              Adds a <strong className="text-foreground">Track your device</strong> button in the customer email when a valid link is provided.
            </p>
          </div>
        </>
      ) : (
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">Returned on</label>
          <input
            type="date"
            value={returnedDate}
            onChange={(e) => setReturnedDate(e.target.value)}
            className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
          />
        </div>
      )}
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 min-w-[100px] flex-1 text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button size="sm" variant="secondary" className="h-7 min-w-[100px] flex-1 gap-1 text-xs" disabled={!canSend} onClick={() => onPreview(payload())}>
            <Eye className="size-3" /> Preview
          </Button>
        )}
        <Button size="sm" className="h-7 min-w-[100px] flex-1 bg-violet-600 text-xs text-white hover:bg-violet-700" disabled={!canSend} onClick={() => onConfirm(payload())}>
          {isComplete ? "Send return complete email" : "Send return email"}
        </Button>
      </div>
    </div>
  );
}

/** Courier dispatch — first email after customer chose courier delivery. */
function CourierDispatchDataModal({
  initial,
  onConfirm,
  onCancel,
  onPreview,
  stepKey,
}: {
  initial: Record<string, unknown>;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
  stepKey: string;
}) {
  const customerDeliveryAddress =
    dynStr(initial, "deliveryAddress") || dynStr(initial, "pickupAddress");
  const [deliveryAddressInput, setDeliveryAddressInput] = useState(() => customerDeliveryAddress);
  const [courierName, setCourierName] = useState(() => dynStr(initial, "courierName"));
  const [trackingNumber, setTrackingNumber] = useState(() => dynStr(initial, "trackingNumber"));
  const [trackingUrl, setTrackingUrl] = useState(() => dynStr(initial, "trackingUrl"));
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const canSend =
    deliveryAddressInput.trim().length >= 5 &&
    courierName.trim().length > 0 &&
    trackingNumber.trim().length > 0;

  function payload(): Record<string, string> {
    return {
      deliveryAddress: deliveryAddressInput.trim(),
      courierName: courierName.trim(),
      trackingNumber: trackingNumber.trim(),
      trackingUrl: trackingUrl.trim(),
      returnMode: "courier",
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-sky-300/80 bg-card p-4 space-y-3 dark:border-sky-800/50">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Courier dispatch</p>
      <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-[11px] leading-relaxed text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100">
        Customer chose: <strong>Courier delivery</strong>
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">
          Delivery address <span className="text-[10px] opacity-60">(from customer)</span>
        </label>
        <textarea
          rows={3}
          placeholder="Address where the device will be couriered"
          value={deliveryAddressInput}
          onChange={(e) => setDeliveryAddressInput(e.target.value)}
          className={cn(PICKUP_INPUT_CLASS, "min-h-[72px] resize-y")}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Courier name</label>
        <input
          type="text"
          placeholder="e.g. Aramex, DHL"
          value={courierName}
          onChange={(e) => setCourierName(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Tracking number</label>
        <input
          type="text"
          placeholder="e.g. AWB123456789"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">
          Tracking link <span className="opacity-60">(optional)</span>
        </label>
        <input
          type="url"
          placeholder="https://courier.com/track/..."
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
        <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
          Customer gets a <strong className="text-foreground">Track your device</strong> button in this email.
        </p>
      </div>
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 min-w-[100px] flex-1 text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button size="sm" variant="secondary" className="h-7 min-w-[100px] flex-1 gap-1 text-xs" disabled={!canSend} onClick={() => onPreview(payload())}>
            <Eye className="size-3" /> Preview
          </Button>
        )}
        <Button size="sm" className="h-7 min-w-[100px] flex-1 bg-sky-600 text-xs text-white hover:bg-sky-700" disabled={!canSend} onClick={() => onConfirm(payload())}>
          Send dispatch email
        </Button>
      </div>
    </div>
  );
}

/** Journey completed — payment + returned date for completion email. */
function JourneyCompletedDataModal({
  initial, currency, onConfirm, onCancel, onPreview, stepKey,
}: {
  initial: Record<string, unknown>;
  currency: string;
  stepKey: RepairJourneyWorkflowStep;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
}) {
  const returnMode = readRepairReturnMode(initial);
  const isCourier = returnMode === "courier";
  const preferredAtAccept = dynStr(initial, "preferredPaymentMethod");
  const storeAddress = normalizeRepairPickUpAddress(dynStr(initial, "collectionAddress"));
  const [finalAmount, setFinalAmount] = useState(() => dynStr(initial, "finalAmount", "paidAmount"));
  const [returnedDate, setReturnedDate] = useState(() => parsePickupDateToIso(dynStr(initial, "returnedDate", "completionDate")));
  const [paymentMethod, setPaymentMethod] = useState(() =>
    dynStr(initial, "paymentMethod", "payoutMethod") || preferredAtAccept,
  );
  const [customMessage, setCustomMessage] = useState(() => readStepCustomMessage(initial, stepKey));

  const returnedDateLabel = formatPickupDateForEmail(returnedDate);
  const canSend =
    returnedDate.length > 0 &&
    Boolean(returnedDateLabel) &&
    paymentMethod.trim().length > 0;
  const paymentChanged =
    preferredAtAccept.trim().length > 0 &&
    paymentMethod.trim().length > 0 &&
    preferredAtAccept.trim().toLowerCase() !== paymentMethod.trim().toLowerCase();

  function payload(): Record<string, string> {
    const fields: Record<string, string> = {
      returnedDate: returnedDateLabel,
      finalAmount: finalAmount.trim(),
      paymentMethod: paymentMethod.trim(),
      returnMode: returnMode ?? "",
      customMessage: customMessage.trim(),
    };
    if (paymentChanged) {
      fields.paymentMethodUpdatedAt = new Date().toISOString();
    }
    return fields;
  }

  return (
    <div className="rounded-xl border border-emerald-300/80 bg-card p-4 space-y-3 dark:border-emerald-800/50">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Completion</p>
      <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-[11px] leading-relaxed text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100">
        Customer chose: <strong>{returnMode ? repairReturnModeLabel(returnMode) : "—"}</strong>
        {isCourier ? (
          <span className="mt-1 block text-[10px] text-sky-900/80 dark:text-sky-100/80">
            Send after the customer receives the courier delivery.
          </span>
        ) : storeAddress ? (
          <span className="mt-1 block text-[10px] text-sky-900/80 dark:text-sky-100/80">
            Pick up address: {storeAddress}
          </span>
        ) : null}
      </div>
      {preferredAtAccept ? (
        <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-[11px] leading-relaxed text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100">
          Customer chose <strong>{preferredAtAccept}</strong> when accepting the quote. Update below if they paid differently at return.
        </div>
      ) : null}
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Final repair amount ({currency}) <span className="text-[10px] opacity-60">(optional)</span></label>
        <input
          {...MONEY_INPUT_PROPS}
          placeholder="Amount charged for repair"
          value={finalAmount}
          onChange={(e) => setFinalAmount(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Payment method at return</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className={PICKUP_INPUT_CLASS}
        >
          <option value="">Select method…</option>
          {REPAIR_RETURN_PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        {paymentChanged ? (
          <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">
            Different from customer preference — completion email will note the change.
          </p>
        ) : null}
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Returned on</label>
        <input
          type="date"
          value={returnedDate}
          onChange={(e) => setReturnedDate(e.target.value)}
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

function StaffNotesPanel({ journey, onRefresh }: { journey: RepairRequestJourney; onRefresh: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const notes: StaffNote[] = (journey.staffNotes ?? []);

  async function handleAdd() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await repairService.addStaffNote(journey._id, text.trim());
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
      await repairService.deleteStaffNote(journey._id, idx);
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
  journey: RepairRequestJourney; id: string; onSuccess: () => void;
  previewEmail: (
    step: string,
    extraDynamic?: Record<string, string>,
    options?: { deliveryLogId?: string },
  ) => void;
  previewBusy: boolean;
}) {
  const [confirming, setConfirming]     = useState<"cancel" | "decline" | null>(null);
  const [resendStep, setResendStep]     = useState<RepairJourneyWorkflowStep | null>(null);
  const [sending, setSending]           = useState(false);
  const [showRequestForm, setShowRequestForm]     = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [showPickupForm, setShowPickupForm]   = useState(false);
  const [showDeviceReceivedForm, setShowDeviceReceivedForm] = useState(false);
  const [showPricingForm, setShowPricingForm] = useState(false);
  const [showDeviceReadyForm, setShowDeviceReadyForm] = useState(false);
  const [showCompletedForm, setShowCompletedForm]   = useState(false);
  const [showCourierDispatchForm, setShowCourierDispatchForm] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);

  const isReturnRequested = journey.status === "device_return_requested";
  const returnUnrepairedSent = journey.sentSteps.some((s) => s.stepKey === "device-return-unrepaired");
  const returnCompleteSent = journey.sentSteps.some((s) => s.stepKey === "device-return-unrepaired-complete");
  const courierDispatchedSent = journey.sentSteps.some((s) => s.stepKey === COURIER_DISPATCH_STEP);
  const customerReturnMode = readRepairReturnMode(journey.dynamicData ?? {});
  const resendableSteps = buildResendableStepKeys(journey);

  const { mutate: sendStep }    = useSendRepairJourneyStep();
  const { mutate: resendMutate } = useResendRepairJourneyStep();
  const { mutate: updateData }  = useUpdateRepairJourneyData();
  const { mutate: cancelMutate, isPending: cancelling }  = useCancelRepairJourney();
  const { mutate: declineMutate, isPending: declining }  = useDeclineQuote();

  const isHardTerminal =
    journey.status === "completed" || journey.status === "cancelled" || journey.status === "no_customer_action";
  const isOfferDeclined = journey.status === "quote_declined";
  const isRequestDeclined = journey.status === "booking_declined";
  const currentStep = journey.currentStep as RepairJourneyWorkflowStep;
  // If Booking Confirmed email hasn't been sent yet, first action is to send it
  const firstEmailSent = journey.completedSteps.includes("booking-confirmed");
  const offerSent   = journey.completedSteps.includes("quote-ready");
  const requestAckGen = bookingAckEffectiveGen(journey);
  const pickupBlockedPendingRequestAck =
    journey.status === "active" &&
    firstEmailSent &&
    requestAckGen > 0 &&
    !customerAcknowledgedCurrentBooking(journey);
  const paymentPhaseBlocked =
    journey.status === "active" &&
    offerSent &&
    currentStep === "repair-in-progress" &&
    !customerAcceptedCurrentQuote(journey);
  const quotePhaseBlocked =
    journey.status === "active" &&
    offerSent &&
    currentStep === "quote-ready" &&
    !customerAcceptedCurrentQuote(journey);
  const deviceReadySent = journey.completedSteps.includes("device-ready");
  const returnModePhaseBlocked =
    journey.status === "active" &&
    deviceReadySent &&
    currentStep === "device-returned" &&
    !customerSelectedReturnMode(journey);
  const baseNextAction = !isHardTerminal
    ? (() => {
        if (isRequestDeclined && firstEmailSent) {
          return {
            label: "Resend Booking Confirmed",
            description:
              "Customer declined the confirmation on this step. Send the email again with fresh Schedule pickup / Decline links, or cancel the journey below.",
            nextStep: "booking-confirmed" as const,
            Icon: Send,
            variant: "primary" as const,
          };
        }
        if (isReturnRequested && !returnCompleteSent) {
          if (!returnUnrepairedSent) {
            return {
              label: "Send device return email",
              description: "Customer requested return without repair. Send return details (separate from repair-complete email).",
              nextStep: "device-return-unrepaired" as const,
              Icon: Package,
              variant: "primary" as const,
            };
          }
          return {
            label: "Send return complete email",
            description: "Confirm the device was returned to the customer without repair.",
            nextStep: "device-return-unrepaired-complete" as const,
            Icon: BadgeCheck,
            variant: "success" as const,
          };
        }
        if (isOfferDeclined && offerSent) {
          const oa = NEXT_ACTION["quote-ready"];
          return oa
            ? {
                ...oa,
                label: "Send revised quote",
                description:
                  "Customer declined the last quote. Enter updated terms and send a new quote email with fresh accept/decline links.",
              }
            : null;
        }
        if (paymentPhaseBlocked || quotePhaseBlocked || returnModePhaseBlocked) {
          return null;
        }
        if (pickupBlockedPendingRequestAck) {
          return null;
        }
        if (currentStep === "device-returned" && customerSelectedReturnMode(journey)) {
          if (customerReturnMode === "courier" && !courierDispatchedSent) {
            return {
              label: "Send courier dispatch email",
              description: "Device shipped via courier — customer gets their delivery address and tracking details.",
              nextStep: COURIER_DISPATCH_STEP,
              Icon: Package,
              variant: "primary" as const,
            };
          }
          return NEXT_ACTION["device-returned"] ?? null;
        }
        if (currentStep === "booking-confirmed" && !firstEmailSent) {
          return SEND_BOOKING_EMAIL_ACTION;
        }
        return NEXT_ACTION[currentStep] ?? null;
      })()
    : null;
  const nextAction = baseNextAction;
  const canDecline  = offerSent && journey.status === "active" && currentStep !== "device-returned";
  const offerGen    = typeof journey.quoteGeneration === "number" ? journey.quoteGeneration : (offerSent ? 1 : 0);
  const revisedOfferSendCount = Math.max(0, offerGen - 1);
  const needsPickupForm  = nextAction?.nextStep === "pickup-scheduled";
  const needsDeviceReceivedForm = nextAction?.nextStep === "device-received";
  const needsPricingForm = nextAction?.nextStep === "quote-ready" || nextAction?.nextStep === "repair-in-progress";
  const needsRequestForm = nextAction?.nextStep === "booking-confirmed";
  const needsInspectionForm = nextAction?.nextStep === "diagnosing";
  const needsDeviceReadyForm = nextAction?.nextStep === "device-ready";
  const needsCourierDispatchForm = nextAction?.nextStep === COURIER_DISPATCH_STEP;
  const needsCompletedForm = nextAction?.nextStep === "device-returned";
  const needsReturnForm =
    nextAction?.nextStep === "device-return-unrepaired" ||
    nextAction?.nextStep === "device-return-unrepaired-complete";
  const reviseOfferAfterDecline =
    journey.status === "quote_declined" && nextAction?.nextStep === "quote-ready";

  function doSend(extraData?: Record<string, unknown>) {
    if (!nextAction) return;
    setSending(true);
    setShowRequestForm(false);
    setShowInspectionForm(false);
    setShowPickupForm(false);
    setShowDeviceReceivedForm(false);
    setShowPricingForm(false);
    setShowDeviceReadyForm(false);
    setShowCompletedForm(false);
    setShowCourierDispatchForm(false);
    setShowReturnForm(false);

    const reviseOnSend =
      journey.status === "quote_declined" && nextAction.nextStep === "quote-ready";

    const resendRequestAfterDecline =
      journey.status === "booking_declined" && nextAction.nextStep === "booking-confirmed";

    if (resendRequestAfterDecline) {
      resendMutate(
        { id, step: "booking-confirmed", payload: { dynamicData: extraData ?? {} } },
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

    if (reviseOnSend) {
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

  function handleReturnFormConfirm(data: Record<string, string>) {
    if (!nextAction) return;
    const { fields, note } = splitCustomMessagePayload(data);
    const updatePayload = buildJourneyUpdateWithNote(journey, nextAction.nextStep, fields, note);
    updateData(
      { id, data: updatePayload },
      {
        onSuccess: () => doSend(buildSendDynamicData(fields, note)),
        onError: (e: unknown) => { toast.error(extractMsg(e)); setSending(false); },
      },
    );
  }

  function handleSendClick() {
    if (needsPickupForm) {
      setShowPickupForm(true);
      return;
    }
    if (needsDeviceReceivedForm) {
      setShowDeviceReceivedForm(true);
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
    if (needsDeviceReadyForm) {
      setShowDeviceReadyForm(true);
      return;
    }
    if (needsCourierDispatchForm) {
      setShowCourierDispatchForm(true);
      return;
    }
    if (needsCompletedForm) {
      setShowCompletedForm(true);
      return;
    }
    if (needsReturnForm) {
      setShowReturnForm(true);
      return;
    }
    doSend();
  }

  function doResend(step: string) {
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
      onSuccess: () => { toast.success("Quote marked as declined"); onSuccess(); setConfirming(null); },
      onError: (e: unknown) => toast.error(extractMsg(e)),
    });
  }

  // Terminal states (negotiation continues when status is quote_declined)
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
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400/90">Quote declined</p>
          {(journey.dynamicData as Record<string, unknown> | undefined)?.quoteDeclineReason ? (
            <p className="text-xs text-foreground mt-1.5 leading-relaxed">
              Customer reason:{" "}
              <strong>{String((journey.dynamicData as Record<string, unknown>).quoteDeclineReason)}</strong>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Send a revised quote from Next Action — choose whether to address their feedback or send a final offer with return option.
          </p>
        </div>
      )}

      {journey.status === "device_return_requested" && (
        <div className="rounded-xl border border-violet-200/80 bg-violet-50/70 dark:border-violet-900/50 dark:bg-violet-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-800 dark:text-violet-300/90">Device return requested</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Customer chose to return the device without repair. Send the return-without-repair email, then the return complete email when done.
          </p>
        </div>
      )}

      {isRequestDeclined && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400/90">Request confirmation declined</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            The customer declined from the Booking Confirmed email. Use Next Action to resend that email with fresh links, or cancel the journey in Danger Zone if you want to close it.
          </p>
        </div>
      )}

      {pickupBlockedPendingRequestAck && (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-400/90">Awaiting customer (Schedule pickup)</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Pickup cannot be scheduled until the customer taps <strong className="text-foreground">Schedule pickup</strong> on the latest Booking Confirmed email (round {requestAckGen}). Resend that step from below if needed.
          </p>
        </div>
      )}

      {quotePhaseBlocked && (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-400/90">Awaiting customer response</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Quote (round {quoteEffectiveGen(journey)}) was sent — waiting for the customer to accept or decline from their email. Use <strong className="text-foreground">Resend</strong> below if they need a fresh link.
          </p>
        </div>
      )}

      {paymentPhaseBlocked && (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-400/90">Awaiting customer acceptance</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Repair cannot start until the customer accepts the latest quote (round {quoteEffectiveGen(journey)}) using the links in their email. The timeline below shows quote emails, accepts, and declines.
          </p>
        </div>
      )}

      {returnModePhaseBlocked && (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/25 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-400/90">Awaiting customer (Device ready)</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Device Return cannot be sent until the customer taps <strong className="text-foreground">Collect from our store</strong> or <strong className="text-foreground">Courier delivery</strong> on the Device Ready email. Their choice will appear here and in Customer Activity.
          </p>
        </div>
      )}

      {offerSent && (
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-2.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quote emails sent</p>
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
                  stepKey="booking-confirmed"
                  initial={journey.dynamicData ?? {}}
                  currency={journey.currency}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowRequestForm(false)}
                  onPreview={(data) => { previewEmail("booking-confirmed", data); }}
                />
              </motion.div>
            ) : showInspectionForm ? (
              <motion.div key="inspection-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <InspectionDataModal
                  stepKey="diagnosing"
                  currency={journey.currency}
                  initial={journey.dynamicData ?? {}}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowInspectionForm(false)}
                  onPreview={(data) => { previewEmail("diagnosing", data); }}
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
            ) : showDeviceReceivedForm ? (
              <motion.div key="device-received-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <DeviceReceivedDataModal
                  stepKey="device-received"
                  initial={journey.dynamicData ?? {}}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowDeviceReceivedForm(false)}
                  onPreview={(data) => { previewEmail("device-received", data); }}
                />
              </motion.div>
            ) : showPricingForm ? (
              <motion.div key="pricing-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {nextAction.nextStep === "quote-ready" ? (
                  <OfferDataModal
                    stepKey="quote-ready"
                    currency={journey.currency}
                    initial={journey.dynamicData ?? {}}
                    isReviseAfterDecline={reviseOfferAfterDecline}
                    declineReason={dynStr(journey.dynamicData ?? {}, "quoteDeclineReason")}
                    onConfirm={handlePricingConfirm}
                    onCancel={() => setShowPricingForm(false)}
                    onPreview={(data) => { previewEmail("quote-ready", data); }}
                  />
                ) : (
                  <RepairInProgressModal
                    stepKey="repair-in-progress"
                    initial={journey.dynamicData ?? {}}
                    onConfirm={handlePricingConfirm}
                    onCancel={() => setShowPricingForm(false)}
                    onPreview={(data) => { previewEmail("repair-in-progress", data); }}
                  />
                )}
              </motion.div>
            ) : showDeviceReadyForm ? (
              <motion.div key="device-ready-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <DeviceReadyDataModal
                  stepKey="device-ready"
                  currency={journey.currency}
                  initial={journey.dynamicData ?? {}}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowDeviceReadyForm(false)}
                  onPreview={(data) => { previewEmail("device-ready", data); }}
                />
              </motion.div>
            ) : showCourierDispatchForm && nextAction ? (
              <motion.div key="courier-dispatch-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <CourierDispatchDataModal
                  stepKey={COURIER_DISPATCH_STEP}
                  initial={journey.dynamicData ?? {}}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowCourierDispatchForm(false)}
                  onPreview={(data) => { previewEmail(COURIER_DISPATCH_STEP, data); }}
                />
              </motion.div>
            ) : showReturnForm && nextAction ? (
              <motion.div key="return-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <ReturnWithoutRepairModal
                  stepKey={nextAction.nextStep as "device-return-unrepaired" | "device-return-unrepaired-complete"}
                  initial={journey.dynamicData ?? {}}
                  onConfirm={handleReturnFormConfirm}
                  onCancel={() => setShowReturnForm(false)}
                  onPreview={(data) => { previewEmail(nextAction.nextStep, data); }}
                />
              </motion.div>
            ) : showCompletedForm ? (
              <motion.div key="completed-form" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <JourneyCompletedDataModal
                  stepKey="device-returned"
                  initial={journey.dynamicData ?? {}}
                  currency={journey.currency}
                  onConfirm={handleStepFormConfirm}
                  onCancel={() => setShowCompletedForm(false)}
                  onPreview={(data) => { previewEmail("device-returned", data); }}
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

      {/* Resend section */}
      {journey.completedSteps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setResendStep(resendStep ? null : (journey.completedSteps[0] as RepairJourneyWorkflowStep))}
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
                  {resendableSteps.map((step) => (
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
                          onClick={() => { previewEmail(step); }}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => doResend(step)}
                          className="flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                        >
                          <span className="truncate">{repairJourneyStepLabel(step)}</span>
                          <RotateCcw className="size-3 shrink-0 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  {resendableSteps.length === 0 && (
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
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">Mark quote as declined?</p>
                  <p className="text-[11px] text-muted-foreground mb-3">This will set the journey status to "Quote Declined".</p>
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
export default function RepairRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: raw, isLoading, refetch, isFetching } = useRepairJourney(id);
  const { data: journeyActionsRaw } = useRepairJourneyActions(id ?? undefined);
  const journeyActions = journeyActionsRaw ?? [];
  const journey: RepairRequestJourney | undefined = raw as unknown as RepairRequestJourney;

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
        ? await repairService.previewJourneyDeliveryLog(id, options.deliveryLogId)
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
      <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/repair")}>
        <ArrowLeft className="mr-1.5 size-3.5" /> Back
      </Button>
    </div>
  );

  const journeyReturnMode = readRepairReturnMode(journey.dynamicData ?? {});
  const showCourierDispatchRow =
    journeyReturnMode === "courier" && customerSelectedReturnMode(journey);
  const courierDispatchedSent = journey.sentSteps.some((s) => s.stepKey === COURIER_DISPATCH_STEP);
  const done  = REPAIR_JOURNEY_WORKFLOW_STEPS.filter((s) => journeyTimelineStepSent(journey, s)).length
    + (showCourierDispatchRow && courierDispatchedSent ? 1 : 0);
  const total = REPAIR_JOURNEY_WORKFLOW_STEPS.length + (showCourierDispatchRow ? 1 : 0);
  const pct   = Math.round((done / total) * 100);
  const isProgressTerminal = ["completed", "cancelled"].includes(journey.status);
  const showDeviceReshipRow = false;

  return (
    <>
    <div className="flex h-full flex-col overflow-hidden bg-background">

      {/* ── Top header bar ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => router.push("/dashboard/repair")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Repair
            </button>
            <ChevronRight className="size-3 text-border" />
            <code className="text-[12px] font-bold text-foreground">{journey.requestId}</code>
            <StatusBadge
              status={journey.status as JourneyStatus}
              closedByReship={journey.dynamicData?.closedByReship === true}
            />
            {Boolean(journey.dynamicData?.reminderDue) && !journey.dynamicData?.bookingAckByCustomer && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 ring-1 ring-amber-400/30">
                Reminder due
              </span>
            )}
            {journey.quoteExpiresAt && journey.status === "active" &&
              new Date(journey.quoteExpiresAt) > new Date() && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 ring-1 ring-blue-400/30">
                Offer expires in {formatRelativeExpiry(journey.quoteExpiresAt)}
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
                {REPAIR_JOURNEY_WORKFLOW_STEPS.map((step, idx) => (
                  <Fragment key={step}>
                    <TimelineStep
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
                        void openEmailPreview("quote-ready", undefined, { deliveryLogId: logId });
                      }}
                    />
                    {step === "device-ready" && showCourierDispatchRow ? (
                      <CourierDispatchTimelineRow
                        journey={journey}
                        onPreviewSentStep={(sk) => { void openEmailPreview(sk); }}
                        previewStepLoading={previewStepLoading}
                      />
                    ) : null}
                  </Fragment>
                ))}
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
              {repairJourneyStepLabel(previewStepKey)}
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
