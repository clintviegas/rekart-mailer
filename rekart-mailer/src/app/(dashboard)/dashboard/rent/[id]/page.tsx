"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  Send,
  CheckCircle2,
  Circle,
  RefreshCw,
  Eye,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  RotateCcw,
  XCircle,
  StickyNote,
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
  Paperclip,
  Activity,
  Package,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDateDDMMYY, formatDateTimeDDMMYY, isoYmdToDisplay, parseDateToIsoYmd } from "@/lib/date-format";
import { toast } from "sonner";
import {
  useRentJourney,
  useSendRentJourneyStep,
  useResendRentJourneyStep,
  useCancelRentJourney,
  useResumeRentFinalOfferQuote,
  useDeclineRentRequest,
  usePreviewRentJourneyEmail,
  useRentStepEmailLogs,
  useUpdateRentJourneyData,
  useRentJourneyActions,
} from "@/hooks/use-rent-journeys";
import { rentService } from "@/services/rent.service";
import apiClient from "@/lib/api";
import { ROUTES } from "@/constants/routes";
import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { getBusinessLocations, type BusinessLocationsByCurrency } from "@/lib/business-locations";
import {
  RENT_JOURNEY_WORKFLOW_STEPS,
  RENT_JOURNEY_STEP_LABELS,
  rentStepLabel,
  getApplicableRentSteps,
  getRentBranchSkippedSteps,
  resolveRentNextStep,
  rentRequestDeclinedPendingResend,
  rentAgreementDeclinedPendingResend,
  isRentAgreementAccepted,
  isRentFinalOfferDeclinedClosed,
  isRentFinalOfferResumePending,
  isRentFinalOfferResumeLocked,
  type RentRequestJourney,
  type RentJourneyWorkflowStep,
  type RentItemLine,
  type RentJourneyAction,
  type RentJourneyActionType,
  type RentJourneyAttachment,
  getRentMoneyHighlight,
} from "@/types/rent";
import { RENT_STATUS_CONFIG } from "@/modules/rent/constants";
import { WORKFLOW_CONFIGS } from "@/modules/rent/workflow-config";
import {
  computeRentItemChanges,
  hasRentItemChanges,
} from "@/lib/rent-item-diff";
import { MONEY_INPUT_PROPS, parseMoneyInput, isValidMoneyInput } from "@/lib/money-input";
import { RENT_HANDOVER_PAYMENT_METHODS } from "@/lib/rent-payment-methods";
import {
  RENT_QUOTE_REVISE_TYPES,
  type RentQuoteReviseType,
} from "@/lib/rent-quote-decline-reasons";
import type { RentItemChangeSet } from "@/types/rent";
import {
  SELL_EMAIL_PREVIEW_DIALOG_CLASS,
  SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS,
  SELL_EMAIL_PREVIEW_IFRAME_CLASS,
} from "@/constants/sell-email-preview";
import { RentSignedAgreementDownload } from "@/components/rent/rent-signed-agreement-download";
import { rentAgreementDataFromJourney } from "@/lib/rent-agreement-download";
import {
  getRentReturnDueInfo,
  rentReturnDueBadgeClass,
  rentReturnDueBadgeLabel,
} from "@/lib/rent-return-due";

const RENT_RESEND_ALLOWED = new Set<RentJourneyWorkflowStep>([
  "rent-request",
  "rent-agreement",
  "rent-ready-pickup",
  "rent-dispatched",
  "rent-handover",
  "rent-return-reminder",
  "rent-return-received",
  "rent-closed",
]);

const CURRENCY_SYMBOL: Record<string, string> = {
  AED: "AED",
  INR: "₹",
  USD: "$",
  SAR: "SAR",
};

const HIDDEN_JOURNEY_DYNAMIC_KEYS = new Set([
  "rentalItems",
  "originalRentalItems",
  "customerItemChanges",
  "requestAckByCustomer",
  "requestAckDeclined",
  "requestAckDeclinedAt",
  "requestAckAcceptedAt",
  "requestAckGeneration",
  "staffDeclinedRequest",
  "declineReason",
  "agreementSigned",
  "agreementSignedAt",
  "fulfillmentMode",
  "pickupLocationId",
  "pickupLocationLabel",
  "confirmedAddress",
  "addressMode",
  "customerMessage",
  "itemsNotes",
  "rentalStartDate",
  "rentalEndDate",
  "customerAddress",
  "customerPhone",
  "rentalTotal",
  "rentalAmount",
  "grandTotal",
  "subtotal",
  "discountTotal",
  "quoteItems",
  "quoteDiscounts",
  "reminderDue",
  "paymentMethod",
  "paymentMethodRecordedAt",
  "paymentMethodRecordedStep",
]);

const RENT_ACTION_META: Record<RentJourneyActionType, { icon: string; label: string; color: string }> = {
  track_clicked: { icon: "📍", label: "Tracked Request", color: "text-violet-700 dark:text-violet-300" },
  request_pickup_chosen: { icon: "🏪", label: "Pickup chosen", color: "text-emerald-700 dark:text-emerald-300" },
  request_delivery_chosen: { icon: "🚚", label: "Delivery chosen", color: "text-emerald-700 dark:text-emerald-300" },
  request_confirmed: { icon: "✅", label: "Request Confirmed", color: "text-emerald-700 dark:text-emerald-300" },
  request_declined: { icon: "❌", label: "Request Declined", color: "text-red-700 dark:text-red-300" },
  agreement_signed: { icon: "✍️", label: "Agreement Signed", color: "text-emerald-700 dark:text-emerald-300" },
  agreement_declined: { icon: "❌", label: "Quote Declined", color: "text-red-700 dark:text-red-300" },
  support_requested: { icon: "💬", label: "Support Requested", color: "text-indigo-700 dark:text-indigo-300" },
};

const RENT_STEP_SHORT: Record<string, string> = {
  "rent-request": "Request",
  "rent-agreement": "Quote",
  "rent-ready-pickup": "Pickup",
  "rent-dispatched": "Dispatch",
  "rent-handover": "Handover",
  "rent-return-reminder": "Return",
  "rent-return-received": "Received",
  "rent-closed": "Closed",
};

function deliveryLogPreviewKey(logId: string) {
  return `dl:${logId}`;
}

function buildRentResendableSteps(journey: RentRequestJourney): RentJourneyWorkflowStep[] {
  const completed = new Set(journey.completedSteps);
  return RENT_JOURNEY_WORKFLOW_STEPS.filter(
    (step) => completed.has(step) && RENT_RESEND_ALLOWED.has(step),
  );
}

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

function ActivityFeed({ journeyId }: { journeyId: string }) {
  const { data: actions, isLoading } = useRentJourneyActions(journeyId);
  if (isLoading) {
    return (
      <p className="py-3 text-center text-xs text-muted-foreground">Loading…</p>
    );
  }
  if (!actions?.length) {
    return (
      <p className="py-3 text-center text-xs text-muted-foreground">
        No customer interactions yet. Actions appear here when customers click email buttons.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {actions.map((a: RentJourneyAction) => {
        const m = RENT_ACTION_META[a.action] ?? {
          icon: "•",
          label: a.action,
          color: "text-muted-foreground",
        };
        const when = a.occurredAt ?? a.createdAt;
        return (
          <div
            key={a._id}
            className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
          >
            <span className="mt-0.5 shrink-0 text-sm">{m.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("font-semibold", m.color)}>{m.label}</span>
                {when ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDateTimeDDMMYY(when)}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {RENT_STEP_SHORT[a.stepKey] ?? a.stepKey}
                </span>
                {!!a.metadata?.declineReason && (
                  <span className="max-w-[200px] truncate text-[10px] italic text-muted-foreground">
                    &ldquo;{String(a.metadata.declineReason)}&rdquo;
                  </span>
                )}
                {!!a.metadata?.customerNote && (
                  <span className="max-w-[200px] truncate text-[10px] italic text-muted-foreground">
                    Note: &ldquo;{String(a.metadata.customerNote)}&rdquo;
                  </span>
                )}
                {!!a.metadata?.fulfillmentMode && (
                  <span className="text-[10px] capitalize text-muted-foreground">
                    → {String(a.metadata.fulfillmentMode)}
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

function EditableField({
  label,
  value,
  fieldKey,
  journeyId,
  disabled,
}: {
  label: string;
  value: string;
  fieldKey: string;
  journeyId: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const { mutate, isPending } = useUpdateRentJourneyData();

  function save() {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    mutate(
      { id: journeyId, data: { [fieldKey]: draft.trim() } },
      { onSettled: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <div className="col-span-2 flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 rounded border border-primary/40 bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="group space-y-0.5 border-b border-border/50 py-1.5 last:border-0">
      <span className="block break-words text-[11px] leading-snug text-muted-foreground">{label}</span>
      <div className="flex items-start gap-1">
        <span className="flex-1 whitespace-normal break-words text-[12px] font-medium leading-snug text-foreground">
          {value || "—"}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
          >
            <Pencil className="size-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function getRentActionBlockedReason(journey: RentRequestJourney, nextStep: RentJourneyWorkflowStep | null): string | null {
  const dd = journey.dynamicData ?? {};
  const agreementSigned = isRentAgreementAccepted(dd);
  const requestDeclined = dd.requestAckDeclined === true;
  const requestConfirmed = dd.requestAckByCustomer === true;
  const agreementDeclined = rentAgreementDeclinedPendingResend(dd);

  if (journey.status !== "active") return "Journey is not active";
  if (!nextStep) {
    if (agreementDeclined) {
      return "Customer declined the quote — send a revised agreement email";
    }
    return "All steps completed";
  }
  if (nextStep === "rent-agreement" && requestDeclined) {
    return "Customer declined — send a revised request email before sending the quote";
  }
  if (nextStep === "rent-agreement" && !requestConfirmed) {
    return "Waiting for customer to confirm items on the rent request email";
  }
  if (
    (nextStep === "rent-ready-pickup" || nextStep === "rent-dispatched") &&
    !agreementSigned
  ) {
    if (agreementDeclined) {
      return "Customer declined the quote — resend a revised agreement email first";
    }
    return "Waiting for customer to accept the rent agreement";
  }
  return null;
}

function StaffNotesPanel({
  journey,
  onRefresh,
}: {
  journey: RentRequestJourney;
  onRefresh: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const notes = journey.staffNotes ?? [];

  async function handleAdd() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await rentService.addStaffNote(journey._id, text.trim());
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
      await rentService.deleteStaffNote(journey._id, idx);
      onRefresh();
    } catch {
      toast.error("Failed to delete note");
    } finally {
      setDeletingIdx(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add internal note… (staff-only, never sent to customer)"
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">{text.length}/2000</span>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!text.trim() || saving}
            onClick={() => { void handleAdd(); }}
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : <StickyNote className="size-3" />}
            Save note
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note, idx) => (
            <div
              key={`${note.createdAt}-${idx}`}
              className="group rounded-lg border border-border bg-muted/20 px-3 py-2.5"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">
                  {formatDateTimeDDMMYY(note.createdAt)}
                </p>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  disabled={deletingIdx === idx}
                  onClick={() => { void handleDelete(idx); }}
                >
                  {deletingIdx === idx ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-[12px] text-foreground">{note.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RentActionPanel({
  journey,
  id,
  onSuccess,
  previewEmail,
  previewBusy,
}: {
  journey: RentRequestJourney;
  id: string;
  onSuccess: () => void;
  previewEmail: (step: string, extraDynamic?: Record<string, unknown>, logId?: string) => void;
  previewBusy: boolean;
}) {
  const [resendOpen, setResendOpen] = useState<RentJourneyWorkflowStep | null>(null);
  const [confirming, setConfirming] = useState<"cancel" | "decline" | null>(null);
  const [resending, setResending] = useState(false);

  const { mutate: sendStep, isPending: sending } = useSendRentJourneyStep();
  const { mutate: resendMutate } = useResendRentJourneyStep();
  const { mutate: cancelMutate, isPending: cancelling } = useCancelRentJourney();
  const { mutate: resumeFinalOfferMutate, isPending: resumingFinalOffer } = useResumeRentFinalOfferQuote();
  const { mutate: declineMutate, isPending: declining } = useDeclineRentRequest();
  const { data: branding } = useWorkspaceBranding();

  const nextStep = useMemo(() => resolveRentNextStep(journey), [journey]);
  const formStep = useMemo(
    () => resolveRentActionFormStep(journey, nextStep),
    [journey, nextStep],
  );

  const confirmSyncKey = rentAgreementConfirmSyncKey(journey);
  const lastFormStepRef = useRef<RentJourneyWorkflowStep | null>(null);

  const [formData, setFormData] = useState<Record<string, string>>(() =>
    buildRentStepInitialForm(
      journey,
      resolveRentActionFormStep(journey, nextStep) ?? "rent-request",
      branding?.businessLocationsByCurrency,
    ),
  );
  const [itemRows, setItemRows] = useState<RentItemLine[]>(() => {
    const step = resolveRentActionFormStep(journey, nextStep);
    if (step === "rent-agreement") return buildRentAgreementItems(journey);
    if (step === "rent-request") return buildRentRequestItems(journey);
    return [];
  });
  const [discountRows, setDiscountRows] = useState<RentDiscountRow[]>(() =>
    nextStep === "rent-agreement" ? buildRentAgreementDiscounts(journey) : [],
  );

  const requestSent = journey.completedSteps.includes("rent-request");
  const requestDeclined = journey.dynamicData?.requestAckDeclined === true;
  const agreementSent = journey.completedSteps.includes("rent-agreement");
  const finalOfferDeclinedClosed = isRentFinalOfferDeclinedClosed(journey.dynamicData);
  const finalOfferResumePending = isRentFinalOfferResumePending(journey.dynamicData);
  const finalOfferOnly =
    finalOfferResumePending || isRentFinalOfferResumeLocked(journey.dynamicData);
  const agreementDeclined = rentAgreementDeclinedPendingResend(journey.dynamicData);
  const showQuoteResendPanel =
    (agreementDeclined && agreementSent) || finalOfferResumePending;
  const quoteDeclineReason = String(journey.dynamicData?.quoteDeclineReason ?? "").trim();
  const quoteDeclineNote = String(journey.dynamicData?.quoteDeclineNote ?? "").trim();
  const [quoteReviseType, setQuoteReviseType] = useState<RentQuoteReviseType>(() => {
    if (isRentFinalOfferResumeLocked(journey.dynamicData)) return "final_offer";
    return (String(journey.dynamicData?.quoteReviseType ?? "after_reason") as RentQuoteReviseType) || "after_reason";
  });
  const resendableSteps = buildRentResendableSteps(journey);
  const actionBlockedReason = getRentActionBlockedReason(journey, nextStep);
  const { data: agreementEmailLogs } = useRentStepEmailLogs(
    agreementSent ? id : undefined,
    agreementSent ? "rent-agreement" : undefined,
  );
  const agreementEmailCount = agreementEmailLogs?.logs?.length ?? 0;
  const canDecline =
    requestSent &&
    journey.status === "active" &&
    !requestDeclined;

  function buildPayload(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(formData)) {
      if (v.trim()) out[k] = v.trim();
    }
    if (agreementDeclined) {
      out.quoteReviseType = finalOfferOnly ? "final_offer" : quoteReviseType;
      if (quoteDeclineReason) out.quoteDeclineReason = quoteDeclineReason;
      if (quoteDeclineNote) out.quoteDeclineNote = quoteDeclineNote;
    }
    if (finalOfferResumePending || isRentFinalOfferResumeLocked(journey.dynamicData)) {
      out.quoteReviseType = "final_offer";
    }
    return out;
  }

  useEffect(() => {
    if (finalOfferOnly) {
      setQuoteReviseType("final_offer");
    }
  }, [finalOfferOnly]);

  useEffect(() => {
    const hydrateStep = formStep;
    if (!hydrateStep) return;
    const hydrated = buildRentStepInitialForm(
      journey,
      hydrateStep,
      branding?.businessLocationsByCurrency,
    );
    const stepChanged = lastFormStepRef.current !== hydrateStep;
    lastFormStepRef.current = hydrateStep;

    setFormData((prev) => {
      if (stepChanged) {
        return {
          ...hydrated,
          customMessage: hydrated.customMessage ?? "",
        };
      }
      const next = { ...prev };
      for (const [k, v] of Object.entries(hydrated)) {
        if (!String(next[k] ?? "").trim() && String(v ?? "").trim()) {
          next[k] = v;
        }
      }
      if (!next.customMessage?.trim() && hydrated.customMessage) {
        next.customMessage = hydrated.customMessage;
      }
      return next;
    });
    if (hydrateStep === "rent-agreement") {
      const items = buildRentAgreementItems(journey);
      setItemRows((prev) => {
        const nextHasNames = items.some((i) => i.name.trim());
        const prevHasNames = prev.some((i) => i.name.trim());
        if (nextHasNames || !prevHasNames) return items;
        return prev;
      });
      setDiscountRows(buildRentAgreementDiscounts(journey));
    } else if (hydrateStep === "rent-request") {
      setItemRows(buildRentRequestItems(journey));
      setDiscountRows([]);
    } else {
      setItemRows([]);
      setDiscountRows([]);
    }
  }, [
    journey,
    formStep,
    confirmSyncKey,
    branding?.businessLocationsByCurrency,
  ]);

  function handleSendNext() {
    if (!nextStep) return;
    sendStep(
      {
        id,
        step: nextStep,
        payload: { dynamicData: buildRentEmailPayload(journey, nextStep, formData, itemRows, discountRows) },
      },
      { onSuccess: () => { setFormData({}); setItemRows([]); setDiscountRows([]); onSuccess(); } },
    );
  }

  function doResend(step: string) {
    setResending(true);
    const dynamicData = buildRentEmailPayload(
      journey,
      step as RentJourneyWorkflowStep,
      formData,
      itemRows,
      discountRows,
    );
    if ((agreementDeclined || finalOfferResumePending) && step === "rent-agreement") {
      dynamicData.quoteReviseType = finalOfferOnly ? "final_offer" : quoteReviseType;
      if (quoteDeclineReason) dynamicData.quoteDeclineReason = quoteDeclineReason;
      if (quoteDeclineNote) dynamicData.quoteDeclineNote = quoteDeclineNote;
    }
    if (finalOfferResumePending) {
      dynamicData.quoteReviseType = "final_offer";
    }
    resendMutate(
      {
        id,
        step,
        payload: { dynamicData },
      },
      {
        onSuccess: () => {
          toast.success("Email resent");
          onSuccess();
          setResendOpen(null);
          setFormData({});
          setItemRows([]);
          setDiscountRows([]);
        },
        onError: (e: unknown) => toast.error(extractMsg(e)),
        onSettled: () => setResending(false),
      },
    );
  }

  function doCancel() {
    cancelMutate(id, {
      onSuccess: () => {
        toast.success("Request cancelled");
        onSuccess();
        setConfirming(null);
      },
      onError: (e: unknown) => toast.error(extractMsg(e)),
    });
  }

  function doDecline() {
    declineMutate(id, {
      onSuccess: () => {
        toast.success("Request marked as declined");
        onSuccess();
        setConfirming(null);
      },
      onError: (e: unknown) => toast.error(extractMsg(e)),
    });
  }

  function doResumeFinalOffer() {
    resumeFinalOfferMutate(id, {
      onSuccess: () => onSuccess(),
    });
  }

  const busy = sending || resending || previewBusy || resumingFinalOffer;

  const canSendStep = useMemo(() => {
    if (!nextStep) return false;
    return canSendRentStep(nextStep, formData, itemRows, discountRows);
  }, [nextStep, formData, itemRows, discountRows]);

  if (journey.status === "completed") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-5 text-center dark:border-emerald-800/40 dark:bg-emerald-950/20">
        <CheckCircle2 className="mx-auto mb-2 size-8 text-emerald-500" />
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">Journey complete</p>
        <p className="mt-1 text-xs text-muted-foreground">All applicable steps have been sent.</p>
      </div>
    );
  }

  if (journey.status === "cancelled") {
    if (finalOfferDeclinedClosed) {
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-5 text-center dark:border-slate-700 dark:bg-slate-900/30">
            <XCircle className="mx-auto mb-2 size-8 text-slate-500" />
            <p className="font-semibold text-foreground">Closed — final offer declined</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Customer declined our best price. This request was closed automatically.
            </p>
            {quoteDeclineReason ? (
              <p className="mt-3 text-[11px] text-foreground">
                Reason: <strong>{quoteDeclineReason}</strong>
              </p>
            ) : null}
            {quoteDeclineNote ? (
              <p className="mt-1 text-[11px] italic text-muted-foreground">&ldquo;{quoteDeclineNote}&rdquo;</p>
            ) : null}
          </div>
          <Button
            type="button"
            className="w-full gap-2"
            disabled={resumingFinalOffer}
            onClick={doResumeFinalOffer}
          >
            {resumingFinalOffer ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Resume final offer
          </Button>
          <p className="text-[10px] text-center text-muted-foreground">
            Resume reopens the quote step — you can send another <strong>final offer</strong> only (no revised-after-feedback email).
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-5 text-center">
        <XCircle className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="font-semibold text-foreground">Request cancelled</p>
        <p className="mt-1 text-xs text-muted-foreground">This journey was cancelled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {agreementSent && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-4 py-2.5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Quote emails sent
            </p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">
              {agreementEmailCount || 1} total
            </p>
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Next action
        </p>

        {requestDeclined && requestSent ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">Customer declined</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Update the request details below and resend with fresh Confirm / Decline links, or cancel below.
              </p>
            </div>
            <StepFormFields
              step="rent-request"
              journey={journey}
              formData={formData}
              setFormData={setFormData}
              currency={journey.currency}
              itemRows={itemRows}
              setItemRows={setItemRows}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2"
                disabled={busy}
                onClick={() => {
                  previewEmail(
                    "rent-request",
                    buildRentEmailPayload(journey, "rent-request", formData, itemRows),
                  );
                }}
              >
                {previewBusy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                Preview
              </Button>
              <Button
                type="button"
                className="flex-[1.35] gap-2"
                disabled={busy || !canSendRentStep("rent-request", formData, itemRows, discountRows)}
                onClick={() => doResend("rent-request")}
              >
                {resending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Resend request
              </Button>
            </div>
          </div>
        ) : showQuoteResendPanel ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
                {finalOfferResumePending ? "Resume final offer" : "Customer declined the quote"}
              </p>
              {!finalOfferResumePending && quoteDeclineReason ? (
                <p className="mt-1 text-[11px] text-amber-950 dark:text-amber-100">
                  Reason: <strong>{quoteDeclineReason}</strong>
                </p>
              ) : null}
              {!finalOfferResumePending && quoteDeclineNote ? (
                <p className="mt-1 text-[11px] text-muted-foreground italic">&ldquo;{quoteDeclineNote}&rdquo;</p>
              ) : null}
              <p className="mt-2 text-[11px] text-muted-foreground">
                {finalOfferOnly
                  ? "Update pricing below and resend a final offer email only — revised-after-feedback is not available on this path."
                  : "Update pricing below and resend a revised quote email (after feedback or final offer)."}
              </p>
            </div>
            {!finalOfferOnly ? (
            <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Revised email type</p>
              <div className="space-y-1.5">
                {RENT_QUOTE_REVISE_TYPES.map((opt) => (
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
            ) : (
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 text-[11px] text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
                Email type: <strong>Final offer</strong> — customer can accept or decline again.
              </div>
            )}
            <StepFormFields
              step="rent-agreement"
              journey={journey}
              formData={formData}
              setFormData={setFormData}
              currency={journey.currency}
              itemRows={itemRows}
              setItemRows={setItemRows}
              discountRows={discountRows}
              setDiscountRows={setDiscountRows}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2"
                disabled={busy}
                onClick={() => {
                  previewEmail(
                    "rent-agreement",
                    buildRentEmailPayload(journey, "rent-agreement", formData, itemRows, discountRows),
                  );
                }}
              >
                {previewBusy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                Preview
              </Button>
              <Button
                type="button"
                className="flex-[1.35] gap-2"
                disabled={busy || !canSendRentStep("rent-agreement", formData, itemRows, discountRows)}
                onClick={() => doResend("rent-agreement")}
              >
                {resending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                {finalOfferOnly ? "Resend final offer" : "Resend revised quote"}
              </Button>
            </div>
          </div>
        ) : actionBlockedReason ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">Action pending</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{actionBlockedReason}</p>
              </div>
            </div>
            {nextStep && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-1.5 text-xs"
                disabled={busy}
                onClick={() => {
                  previewEmail(
                    nextStep,
                    buildRentEmailPayload(journey, nextStep, formData, itemRows, discountRows),
                  );
                }}
              >
                <Eye className="size-3.5" /> Preview {rentStepLabel(nextStep)} email
              </Button>
            )}
          </div>
        ) : nextStep ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-[13px] font-semibold text-foreground">{rentStepLabel(nextStep)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {WORKFLOW_CONFIGS.find((c) => c.stepId === nextStep)?.description}
              </p>
              {nextStep === "rent-return-reminder" &&
              !journey.completedSteps.includes("rent-return-reminder") ? (
                <p className="mt-2 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2.5 py-2 text-[10px] leading-relaxed text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
                  Reminder email auto-sends 24 hours before the return due date. If you click{" "}
                  <span className="font-semibold">Send</span> now, the automatic reminder will not
                  go again for this order.
                </p>
              ) : null}
            </div>

            {nextStep === "rent-agreement" && journey.dynamicData?.requestAckByCustomer === true ? (
              <CustomerConfirmSummary journey={journey} />
            ) : null}

            <StepFormFields
              step={nextStep}
              journey={journey}
              formData={formData}
              setFormData={setFormData}
              currency={journey.currency}
              itemRows={itemRows}
              setItemRows={setItemRows}
              discountRows={discountRows}
              setDiscountRows={setDiscountRows}
            />

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-1.5"
                disabled={busy}
                onClick={() => {
                  previewEmail(
                    nextStep,
                    buildRentEmailPayload(journey, nextStep, formData, itemRows, discountRows),
                  );
                }}
              >
                <Eye className="size-3.5" /> Preview
              </Button>
              <Button
                type="button"
                className="flex-1 gap-1.5"
                disabled={busy || !canSendStep}
                onClick={handleSendNext}
              >
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Send
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {journey.completedSteps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <button
            type="button"
            onClick={() =>
              setResendOpen(
                resendOpen ? null : (journey.completedSteps[0] as RentJourneyWorkflowStep),
              )
            }
            className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            <span>Resend emails</span>
            {resendOpen !== null ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>

          <AnimatePresence>
            {resendOpen !== null && (
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
                        disabled={busy}
                        onClick={() => {
                          previewEmail(
                            step,
                            buildRentEmailPayload(
                              journey,
                              step,
                              formData,
                              itemRows,
                              discountRows,
                            ),
                          );
                        }}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => doResend(step)}
                        className="flex min-w-0 flex-1 items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
                      >
                        <span className="truncate">{rentStepLabel(step)}</span>
                        <RotateCcw className="size-3 shrink-0 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  {resendableSteps.length === 0 && (
                    <p className="py-1 text-center text-xs text-muted-foreground">No resendable steps yet.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Danger zone
        </p>
        <div className="space-y-2">
          {canDecline && (
            <AnimatePresence mode="wait">
              {confirming !== "decline" ? (
                <motion.button
                  key="btn-decline"
                  type="button"
                  onClick={() => setConfirming("decline")}
                  className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400"
                >
                  <XCircle className="size-3.5" /> Decline request
                </motion.button>
              ) : (
                <motion.div
                  key="confirm-decline"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-lg border border-red-200 bg-red-50 p-3 dark:bg-red-950/30"
                >
                  <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-300">
                    Mark request as declined?
                  </p>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Customer confirm links will stop working. You can send a revised request email after.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 flex-1 bg-red-600 text-xs text-white hover:bg-red-700"
                      onClick={doDecline}
                      disabled={declining}
                    >
                      {declining ? <Loader2 className="size-3 animate-spin" /> : "Decline"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <AnimatePresence mode="wait">
            {confirming !== "cancel" ? (
              <motion.button
                key="btn-cancel"
                type="button"
                onClick={() => setConfirming("cancel")}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60"
              >
                <XCircle className="size-3.5" /> Cancel request
              </motion.button>
            ) : (
              <motion.div
                key="confirm-cancel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <p className="mb-2 text-xs font-semibold text-foreground">Cancel this request?</p>
                <p className="mb-3 text-[11px] text-muted-foreground">This action cannot be undone.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 flex-1 text-xs"
                    onClick={doCancel}
                    disabled={cancelling}
                  >
                    {cancelling ? <Loader2 className="size-3 animate-spin" /> : "Cancel request"}
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

function readStepCustomMessage(d: Record<string, unknown>, stepKey: string): string {
  const raw = d.customMessages;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>)[stepKey];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function mergeStepCustomMessages(
  journey: RentRequestJourney,
  stepKey: string,
  note: string,
): Record<string, string> {
  const prev = { ...((journey.dynamicData?.customMessages as Record<string, string> | undefined) ?? {}) };
  const t = note.trim();
  if (t) prev[stepKey] = t;
  else delete prev[stepKey];
  return prev;
}

function emptyRentItemLine(): RentItemLine {
  return { name: "", qty: 1, rate: "" };
}

function rentalLinesTotal(items: RentItemLine[]): number {
  return items
    .filter((i) => i.name.trim())
    .reduce((sum, i) => {
      const rate = parseMoneyInput(i.rate);
      if (!Number.isFinite(rate)) return sum;
      return sum + Math.max(1, i.qty) * rate;
    }, 0);
}

function toDateInputValue(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return parseDateToIsoYmd(s) || s;
}

function computeRentalDurationDays(startIso: string, endIso: string): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
}

function formatRentalDurationLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

function coerceRentItemArray(raw: unknown): unknown[] {
  if (raw == null || raw === "") return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function parseRentItemsSummary(raw: unknown): RentItemLine[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.+?)\s*[×x]\s*(\d+)\s*$/i);
      if (match) {
        return {
          name: match[1].trim(),
          qty: Math.max(1, parseInt(match[2], 10) || 1),
          rate: "",
        };
      }
      return { name: part, qty: 1, rate: "" };
    })
    .filter((item) => item.name.trim());
}

function parseRentItemLines(raw: unknown): RentItemLine[] {
  return coerceRentItemArray(raw)
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        return name ? { name, qty: 1, rate: "" } : null;
      }
      const row = item as Record<string, unknown>;
      const name = String(
        row.name ??
          row.itemName ??
          row.item ??
          row.label ??
          row.description ??
          row.title ??
          "",
      ).trim();
      const qty = Math.max(1, Math.round(Number(row.qty ?? row.quantity ?? 1) || 1));
      const rate = String(row.rate ?? row.price ?? row.charge ?? "").trim();
      return { name, qty, rate };
    })
    .filter((item): item is RentItemLine => item != null && Boolean(item.name.trim()));
}

function rentDateDisplayValue(raw: string | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return formatDateDDMMYY(value) || value;
}

function resolveRentActionFormStep(
  journey: RentRequestJourney,
  nextStep: RentJourneyWorkflowStep | null,
): RentJourneyWorkflowStep | null {
  if (
    isRentFinalOfferResumePending(journey.dynamicData) &&
    journey.completedSteps.includes("rent-agreement")
  ) {
    return "rent-agreement";
  }
  if (
    rentAgreementDeclinedPendingResend(journey.dynamicData) &&
    journey.completedSteps.includes("rent-agreement")
  ) {
    return "rent-agreement";
  }
  if (
    journey.dynamicData?.requestAckDeclined === true &&
    journey.completedSteps.includes("rent-request")
  ) {
    return "rent-request";
  }
  return nextStep;
}

function buildRentRequestItems(journey: RentRequestJourney): RentItemLine[] {
  const dd = journey.dynamicData ?? {};
  const sources = [
    dd.rentalItems,
    dd.originalRentalItems,
    parseRentItemsSummary(dd.rentalItemsSummary),
  ];

  for (const src of sources) {
    const items = Array.isArray(src) ? parseRentItemLines(src) : [];
    if (items.length > 0) {
      return items.map((item) => ({
        name: item.name,
        qty: item.qty,
        rate: "",
      }));
    }
  }

  return [emptyRentItemLine()];
}

function buildRentRequestFormData(journey: RentRequestJourney): Record<string, string> {
  const dd = journey.dynamicData ?? {};
  const out: Record<string, string> = {};

  if (dd.customerPhone) out.customerPhone = String(dd.customerPhone);
  if (dd.customerAddress) out.customerAddress = String(dd.customerAddress);

  const requestDate = toDateInputValue(dd.requestDate);
  if (requestDate) out.requestDate = requestDate;

  return out;
}

function buildRentAgreementItems(journey: RentRequestJourney): RentItemLine[] {
  const dd = journey.dynamicData ?? {};
  const sources = [
    dd.customerRentalItems,
    dd.rentalItems,
    dd.originalRentalItems,
    parseRentItemsSummary(dd.rentalItemsSummary),
  ];

  for (const src of sources) {
    const items = Array.isArray(src) ? parseRentItemLines(src) : [];
    if (items.length > 0) return items;
  }

  return [emptyRentItemLine()];
}

function normalizeRentItemRows(rows: RentItemLine[]): RentItemLine[] {
  return rows
    .map((item) => ({
      name: item.name.trim(),
      qty: Math.max(1, Math.round(Number(item.qty) || 1)),
      rate: String(item.rate ?? "").trim(),
    }))
    .filter((item) => item.name && isValidMoneyInput(item.rate));
}

type RentDiscountRow = { id: string; description: string; amount: string };

function newRentDiscountRow(): RentDiscountRow {
  return { id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, description: "", amount: "" };
}

function parseStoredRentDiscounts(dd: Record<string, unknown>): RentDiscountRow[] {
  const raw = dd.quoteDiscounts;
  if (raw == null || raw === "") return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map((row, i) => {
      const r = row as Record<string, unknown>;
      const description = String(r.description ?? r.label ?? r.name ?? "");
      const amount = String(r.amount ?? r.discount ?? "");
      return {
        id: `d-${i}-${description}-${amount}`,
        description,
        amount,
      };
    });
  } catch {
    return [];
  }
}

function validRentDiscounts(rows: RentDiscountRow[]): { description: string; amount: string }[] {
  return rows
    .map((row) => ({
      description: row.description.trim(),
      amount: row.amount.trim(),
    }))
    .filter((row) => row.description.length > 0 && isValidMoneyInput(row.amount) && parseMoneyInput(row.amount) > 0);
}

function rentDiscountsTotal(rows: RentDiscountRow[]): number {
  return validRentDiscounts(rows).reduce((sum, row) => sum + parseMoneyInput(row.amount), 0);
}

function buildRentAgreementDiscounts(journey: RentRequestJourney): RentDiscountRow[] {
  return parseStoredRentDiscounts(journey.dynamicData ?? {});
}

function rentQuoteTotals(items: RentItemLine[], discounts: RentDiscountRow[]) {
  const subtotal = rentalLinesTotal(items);
  const parsed = validRentDiscounts(discounts);
  const discountTotal = rentDiscountsTotal(discounts);
  const total = Math.max(0, subtotal - discountTotal);
  return { subtotal, discountTotal, total, parsed };
}

function fieldFilled(value: string | undefined): boolean {
  return String(value ?? "").trim().length > 0;
}

function isValidMoneyField(value: string | undefined): boolean {
  return isValidMoneyInput(value);
}

function discountRowsValid(rows: RentDiscountRow[]): boolean {
  for (const row of rows) {
    const desc = row.description.trim();
    const amt = row.amount.trim();
    if (!desc && !amt) continue;
    if (!desc || !amt) return false;
    if (!isValidMoneyInput(amt)) return false;
  }
  return true;
}

function canSendRentStep(
  step: RentJourneyWorkflowStep,
  formData: Record<string, string>,
  itemRows: RentItemLine[],
  discountRows: RentDiscountRow[],
): boolean {
  if (!discountRowsValid(discountRows)) return false;

  switch (step) {
    case "rent-request":
      return itemRows.some((item) => item.name.trim());
    case "rent-agreement": {
      const startIso = parseDateToIsoYmd(formData.rentalStartDate ?? "");
      const endIso = parseDateToIsoYmd(formData.rentalEndDate ?? "");
      if (!startIso || !endIso || computeRentalDurationDays(startIso, endIso) == null) return false;
      if (!fieldFilled(formData.fulfillmentMode)) return false;
      if (!fieldFilled(formData.confirmedAddress)) return false;
      if (!fieldFilled(formData.securityDeposit) || !isValidMoneyField(formData.securityDeposit)) return false;

      const validItems = normalizeRentItemRows(itemRows);
      if (validItems.length === 0) return false;
      if (!validItems.some((item) => isValidMoneyInput(item.rate))) return false;

      const { subtotal, total } = rentQuoteTotals(itemRows, discountRows);
      return subtotal > 0 && total > 0;
    }
    case "rent-ready-pickup":
      return (
        fieldFilled(formData.pickupAddress) &&
        fieldFilled(formData.pickupDate) &&
        fieldFilled(formData.pickupTime)
      );
    case "rent-dispatched":
      return fieldFilled(formData.courierName) && fieldFilled(formData.trackingNumber);
    case "rent-handover":
      return (
        fieldFilled(formData.rentalAmount) &&
        isValidMoneyField(formData.rentalAmount) &&
        fieldFilled(formData.securityDeposit) &&
        isValidMoneyField(formData.securityDeposit) &&
        fieldFilled(formData.returnDueDate) &&
        fieldFilled(formData.paymentMethod)
      );
    case "rent-return-reminder":
      return fieldFilled(formData.returnDueDate);
    case "rent-return-received":
      return fieldFilled(formData.receivedAt) && fieldFilled(formData.returnCondition);
    case "rent-closed":
      return (
        fieldFilled(formData.depositRefund) &&
        isValidMoneyField(formData.depositRefund) &&
        fieldFilled(formData.depositDeduction) &&
        isValidMoneyField(formData.depositDeduction)
      );
    default:
      return true;
  }
}

function resolveRentQuoteAddress(
  dynamicData: Record<string, unknown> | undefined,
): string {
  const dd = dynamicData ?? {};
  const mode = String(dd.fulfillmentMode ?? "").toLowerCase();
  if (mode === "pickup") {
    return String(dd.confirmedAddress ?? "").trim();
  }
  return String(dd.confirmedAddress ?? dd.customerAddress ?? "").trim();
}

function resolveRentPickupSelection(
  dd: Record<string, unknown>,
  currency: string,
  storedLocations?: BusinessLocationsByCurrency | null,
) {
  const locations = getBusinessLocations(currency, storedLocations);
  const savedId = String(dd.pickupLocationId ?? "").trim();
  const savedAddress = String(dd.confirmedAddress ?? "").trim();
  const savedLabel = String(dd.pickupLocationLabel ?? "").trim();

  const byId = savedId ? locations.find((l) => l.id === savedId) : undefined;
  const byAddress = savedAddress
    ? locations.find((l) => l.address === savedAddress)
    : undefined;
  const byLabel = savedLabel ? locations.find((l) => l.label === savedLabel) : undefined;
  const match = byId ?? byAddress ?? byLabel;

  if (match) return match;
  if (savedAddress) {
    return {
      id: savedId || `saved-${savedAddress.slice(0, 24)}`,
      label: savedLabel || savedAddress,
      address: savedAddress,
    };
  }
  return locations[0] ?? null;
}

function buildRentAgreementFormData(
  journey: RentRequestJourney,
  storedLocations?: BusinessLocationsByCurrency | null,
): Record<string, string> {
  const dd = journey.dynamicData ?? {};
  const out: Record<string, string> = {};

  const startIso = toDateInputValue(dd.rentalStartDate);
  const endIso = toDateInputValue(dd.rentalEndDate);
  if (startIso) out.rentalStartDate = startIso;
  if (endIso) out.rentalEndDate = endIso;

  const mode = String(dd.fulfillmentMode ?? "").trim().toLowerCase();
  if (mode === "pickup" || mode === "delivery") out.fulfillmentMode = mode;

  if (mode === "pickup") {
    const loc = resolveRentPickupSelection(dd, journey.currency, storedLocations);
    if (loc) {
      out.pickupLocationId = loc.id;
      out.pickupLocationLabel = loc.label;
      out.confirmedAddress = loc.address;
    }
  } else if (mode === "delivery") {
    const addr = String(dd.confirmedAddress ?? dd.customerAddress ?? "").trim();
    if (addr) out.confirmedAddress = addr;
  } else {
    const addr = resolveRentQuoteAddress(dd);
    if (addr) out.confirmedAddress = addr;
  }

  const msg = dd.customerMessage ?? dd.itemsNotes;
  if (msg) out.customerMessage = String(msg);

  const days =
    computeRentalDurationDays(startIso, endIso) ??
    (dd.rentalDurationDays != null ? Number(dd.rentalDurationDays) : null);
  if (days != null && Number.isFinite(days) && days > 0) {
    out.rentalDuration = formatRentalDurationLabel(days);
  } else if (dd.rentalDuration) {
    out.rentalDuration = String(dd.rentalDuration);
  }

  if (dd.securityDeposit != null && String(dd.securityDeposit).trim()) {
    out.securityDeposit = String(dd.securityDeposit);
  }

  return out;
}

function rentAgreementConfirmSyncKey(journey: RentRequestJourney): string {
  const dd = journey.dynamicData ?? {};
  return [
    dd.requestConfirmedAt,
    dd.fulfillmentMode,
    dd.pickupLocationId,
    dd.pickupLocationLabel,
    dd.confirmedAddress,
    dd.customerAddress,
    dd.rentalStartDate,
    dd.rentalEndDate,
    dd.customerMessage,
    dd.itemsNotes,
    JSON.stringify(dd.customerRentalItems ?? dd.rentalItems ?? dd.originalRentalItems ?? []),
    String(dd.rentalItemsSummary ?? ""),
  ]
    .map((v) => String(v ?? ""))
    .join("|");
}

function buildRentStepInitialForm(
  journey: RentRequestJourney,
  step: RentJourneyWorkflowStep,
  storedLocations?: BusinessLocationsByCurrency | null,
): Record<string, string> {
  const dd = journey.dynamicData ?? {};
  const out: Record<string, string> = {};
  const note = readStepCustomMessage(dd, step);
  if (note) out.customMessage = note;

  if (step === "rent-agreement") {
    return { ...buildRentAgreementFormData(journey, storedLocations), ...out };
  }

  if (step === "rent-request") {
    return { ...buildRentRequestFormData(journey), ...out };
  }

  if (step === "rent-ready-pickup") {
    const addr = resolveRentQuoteAddress(dd);
    if (addr) out.pickupAddress = addr;
    if (dd.pickupLocationLabel) out.pickupLocationLabel = String(dd.pickupLocationLabel);
    if (dd.rentalStartDate) {
      const start = String(dd.rentalStartDate);
      out.pickupDate = start.includes("-") ? formatDateDDMMYY(start) : start;
    }
  }

  if (step === "rent-dispatched") {
    if (dd.confirmedAddress) out.deliveryAddress = String(dd.confirmedAddress);
  }

  if (step === "rent-handover" || step === "rent-return-reminder") {
    if (dd.rentalDuration) out.rentalDuration = String(dd.rentalDuration);
    if (dd.rentalEndDate) {
      const end = String(dd.rentalEndDate);
      out.returnDueDate = end.includes("-") ? formatDateDDMMYY(end) : end;
    }
    if (dd.rentalAmount != null) out.rentalAmount = String(dd.rentalAmount);
    if (dd.securityDeposit != null) out.securityDeposit = String(dd.securityDeposit);
  }

  if (step === "rent-handover") {
    if (dd.paymentMethod) out.paymentMethod = String(dd.paymentMethod);
  }

  if (step === "rent-return-received" || step === "rent-closed") {
    if (dd.receivedAt) out.receivedAt = String(dd.receivedAt);
    if (dd.returnCondition) out.returnCondition = String(dd.returnCondition);
  }

  if (step === "rent-closed") {
    if (dd.depositRefund != null && String(dd.depositRefund).trim()) {
      out.depositRefund = String(dd.depositRefund);
    } else if (dd.securityDeposit != null && String(dd.securityDeposit).trim()) {
      out.depositRefund = String(dd.securityDeposit);
    }
    if (dd.depositDeduction != null && String(dd.depositDeduction).trim()) {
      out.depositDeduction = String(dd.depositDeduction);
    } else {
      out.depositDeduction = "0";
    }
    const closureNote = String(dd.closureNotes ?? "").trim();
    if (closureNote && !out.customMessage) out.customMessage = closureNote;
  }

  return out;
}

function buildSendPayload(
  journey: RentRequestJourney,
  step: RentJourneyWorkflowStep,
  formData: Record<string, string>,
  itemRows: RentItemLine[] = [],
  discountRows: RentDiscountRow[] = [],
): Record<string, unknown> {
  const {
    customMessage = "",
    rentalStartDate: formStart,
    rentalEndDate: formEnd,
    fulfillmentMode,
    confirmedAddress,
    pickupLocationId,
    pickupLocationLabel,
    customerMessage,
    ...fields
  } = formData;
  const customMessages = mergeStepCustomMessages(journey, step, customMessage);
  const dynamicData: Record<string, unknown> = { ...fields, customMessages };
  if (customMessage.trim()) dynamicData.customMessage = customMessage.trim();

  if (step === "rent-handover") {
    const method = String(fields.paymentMethod ?? "").trim();
    if (method) {
      dynamicData.paymentMethod = method;
      dynamicData.paymentMethodRecordedAt = new Date().toISOString();
      dynamicData.paymentMethodRecordedStep = step;
    } else {
      delete dynamicData.paymentMethod;
      delete dynamicData.paymentMethodRecordedAt;
      delete dynamicData.paymentMethodRecordedStep;
    }
  }

  if (step === "rent-request") {
    const validItems = itemRows
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        qty: Math.max(1, item.qty),
        rate: "",
      }));
    const rentalItemsSummary = validItems.map((item) => `${item.name} ×${item.qty}`).join(", ");

    if (fields.customerPhone?.trim()) {
      dynamicData.customerPhone = fields.customerPhone.trim();
    } else {
      delete dynamicData.customerPhone;
    }
    if (fields.customerAddress?.trim()) {
      dynamicData.customerAddress = fields.customerAddress.trim();
    } else {
      delete dynamicData.customerAddress;
    }
    const requestDateIso = parseDateToIsoYmd(String(fields.requestDate ?? ""));
    if (requestDateIso) {
      dynamicData.requestDate = isoYmdToDisplay(requestDateIso);
    } else if (fields.requestDate?.trim()) {
      dynamicData.requestDate = fields.requestDate.trim();
    } else {
      delete dynamicData.requestDate;
    }

    if (validItems.length > 0) {
      dynamicData.rentalItems = validItems;
      dynamicData.rentalItemsSummary = rentalItemsSummary || undefined;
    } else {
      delete dynamicData.rentalItems;
      delete dynamicData.rentalItemsSummary;
    }
  }

  if (step === "rent-agreement") {
    const startIso = parseDateToIsoYmd(formStart ?? "");
    const endIso = parseDateToIsoYmd(formEnd ?? "");
    const durationDays = computeRentalDurationDays(startIso, endIso);
    const validItems = normalizeRentItemRows(itemRows);
    const { subtotal, total, parsed: validDiscounts } = rentQuoteTotals(
      itemRows,
      discountRows,
    );
    const rentalItemsSummary = validItems.map((i) => `${i.name} ×${i.qty}`).join(", ");

    if (startIso) {
      dynamicData.rentalStartDate = isoYmdToDisplay(startIso);
    }
    if (endIso) {
      dynamicData.rentalEndDate = endIso;
      dynamicData.returnDueDate = isoYmdToDisplay(endIso);
    }
    if (durationDays != null) {
      dynamicData.rentalDuration = formatRentalDurationLabel(durationDays);
      dynamicData.rentalDurationDays = durationDays;
    }
    if (fulfillmentMode?.trim()) {
      dynamicData.fulfillmentMode = fulfillmentMode.trim();
    }
    if (fulfillmentMode?.trim() === "pickup") {
      if (pickupLocationId?.trim()) dynamicData.pickupLocationId = pickupLocationId.trim();
      if (pickupLocationLabel?.trim()) {
        dynamicData.pickupLocationLabel = pickupLocationLabel.trim();
      }
      dynamicData.addressMode = "pickup";
    } else if (fulfillmentMode?.trim() === "delivery") {
      dynamicData.addressMode = dynamicData.addressMode ?? "saved";
      delete dynamicData.pickupLocationId;
      delete dynamicData.pickupLocationLabel;
    }
    if (confirmedAddress?.trim()) {
      dynamicData.confirmedAddress = confirmedAddress.trim();
      if (fulfillmentMode?.trim() === "delivery") {
        dynamicData.customerAddress = confirmedAddress.trim();
      }
    }
    if (customerMessage?.trim()) {
      dynamicData.customerMessage = customerMessage.trim();
      dynamicData.itemsNotes = customerMessage.trim();
    }
    if (validItems.length > 0) {
      dynamicData.rentalItems = validItems;
      dynamicData.customerRentalItems = validItems;
      dynamicData.rentalItemsSummary = rentalItemsSummary;
    }
    if (validDiscounts.length > 0) {
      dynamicData.quoteDiscounts = JSON.stringify(validDiscounts);
    } else {
      delete dynamicData.quoteDiscounts;
    }
    delete dynamicData.rentalAmount;
    if (total > 0) {
      dynamicData.rentalTotal = String(total);
      dynamicData.rentalAmount = String(total);
    } else if (subtotal > 0) {
      dynamicData.rentalTotal = String(subtotal);
      dynamicData.rentalAmount = String(subtotal);
    }
  }

  if (step === "rent-return-received") {
    const receivedAt = String(fields.receivedAt ?? "").trim();
    const returnCondition = String(fields.returnCondition ?? "").trim();
    if (receivedAt) dynamicData.receivedAt = receivedAt;
    if (returnCondition) dynamicData.returnCondition = returnCondition;
  }

  if (step === "rent-closed") {
    const refund = String(fields.depositRefund ?? "").trim();
    const deduction = String(fields.depositDeduction ?? "").trim();
    if (refund) dynamicData.depositRefund = refund;
    if (deduction !== "") dynamicData.depositDeduction = deduction;
    const note = customMessage.trim();
    if (note) {
      dynamicData.closureNotes = note;
      dynamicData.customMessage = note;
    }
  }

  return dynamicData;
}

function rentPayloadFieldPresent(data: Record<string, unknown>, key: string): boolean {
  const v = data[key];
  return v != null && String(v).trim() !== "";
}

/** Merge live form values with saved journey fields (resend / partial forms). */
function buildRentEmailPayload(
  journey: RentRequestJourney,
  step: RentJourneyWorkflowStep,
  formData: Record<string, string>,
  itemRows: RentItemLine[] = [],
  discountRows: RentDiscountRow[] = [],
): Record<string, unknown> {
  const payload = buildSendPayload(journey, step, formData, itemRows, discountRows);
  const dd = journey.dynamicData ?? {};

  if (step === "rent-return-received") {
    if (!rentPayloadFieldPresent(payload, "receivedAt") && dd.receivedAt) {
      payload.receivedAt = String(dd.receivedAt);
    }
    if (!rentPayloadFieldPresent(payload, "returnCondition") && dd.returnCondition) {
      payload.returnCondition = String(dd.returnCondition);
    }
  }

  if (step === "rent-closed") {
    if (!rentPayloadFieldPresent(payload, "depositRefund")) {
      if (dd.depositRefund != null && String(dd.depositRefund).trim()) {
        payload.depositRefund = String(dd.depositRefund);
      } else if (dd.securityDeposit != null && String(dd.securityDeposit).trim()) {
        payload.depositRefund = String(dd.securityDeposit);
      }
    }
    if (!rentPayloadFieldPresent(payload, "depositDeduction")) {
      if (dd.depositDeduction != null && String(dd.depositDeduction).trim()) {
        payload.depositDeduction = String(dd.depositDeduction);
      }
    }
    if (!rentPayloadFieldPresent(payload, "closureNotes") && dd.closureNotes) {
      payload.closureNotes = String(dd.closureNotes);
    }
  }

  return payload;
}

function StepCustomMessageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        Note for customer <span className="text-[10px] opacity-60">(optional)</span>
      </label>
      <Textarea
        placeholder="Shows in the email in a highlighted box. Leave empty to hide."
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-[72px] resize-y"
      />
    </div>
  );
}

function CustomerConfirmSummary({ journey }: { journey: RentRequestJourney }) {
  const dd = journey.dynamicData ?? {};
  if (dd.requestAckByCustomer !== true) return null;

  const items = buildRentAgreementItems(journey).filter((i) => i.name.trim());
  const originalItems = parseRentItemLines(dd.originalRentalItems);
  const changes =
    (dd.customerItemChanges as RentItemChangeSet | undefined) ??
    computeRentItemChanges(originalItems, items);
  const message = String(dd.customerMessage ?? dd.itemsNotes ?? "").trim();
  const start = String(dd.rentalStartDate ?? "");
  const end = String(dd.rentalEndDate ?? "");
  const mode = String(dd.fulfillmentMode ?? "");
  const pickupLabel = String(dd.pickupLocationLabel ?? "");
  const address = String(dd.confirmedAddress ?? dd.customerAddress ?? "");

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-3 dark:border-emerald-900 dark:bg-emerald-950/20">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
        Customer confirmed
      </p>
      <div className="space-y-2 text-[11px] text-foreground">
        {start && end ? (
          <p><span className="font-semibold">Period:</span> {formatDateDDMMYY(start)} → {formatDateDDMMYY(end)}</p>
        ) : null}
        {mode ? (
          <p>
            <span className="font-semibold">Fulfillment:</span>{" "}
            <span className="capitalize">{mode === "delivery" ? "Home delivery" : mode}</span>
          </p>
        ) : null}
        {mode === "pickup" && address ? (
          <p>
            <span className="font-semibold">Pickup:</span>{" "}
            {pickupLabel ? `${pickupLabel} — ` : ""}
            {address}
          </p>
        ) : null}
        {mode === "delivery" && address ? (
          <p><span className="font-semibold">Delivery address:</span> {address}</p>
        ) : null}
        {!mode && address ? (
          <p><span className="font-semibold">Address:</span> {address}</p>
        ) : null}
        {message ? <p><span className="font-semibold">Message:</span> {message}</p> : null}
        {items.length > 0 ? (
          <div>
            <p className="mb-1 font-semibold">Items ({items.length})</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {items.map((item, i) => (
                <li key={i}>{item.name} × {item.qty}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {hasRentItemChanges(changes) ? (
          <div className="pt-1">
            <RentItemChangesPanel changes={changes} />
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Same details are pre-filled in the form below — edit before sending.
      </p>
    </div>
  );
}

function stepState(
  journey: RentRequestJourney,
  step: RentJourneyWorkflowStep,
): "done" | "current" | "pending" | "skipped" | "revision" {
  const skipped = getRentBranchSkippedSteps(journey.dynamicData);
  if (skipped.has(step)) return "skipped";

  const requestDeclined = rentRequestDeclinedPendingResend(journey.dynamicData);
  const agreementDeclined = rentAgreementDeclinedPendingResend(journey.dynamicData);
  const requestSent = journey.completedSteps.includes("rent-request");

  if (requestDeclined) {
    if (step === "rent-request" && requestSent) return "revision";
    if (journey.completedSteps.includes(step)) return "done";
    return "pending";
  }

  if (agreementDeclined) {
    if (step === "rent-agreement" && journey.completedSteps.includes("rent-agreement")) {
      return "revision";
    }
    if (journey.completedSteps.includes(step)) return "done";
    return "pending";
  }

  if (journey.completedSteps.includes(step)) return "done";
  const applicable = getApplicableRentSteps(journey.dynamicData);
  const nextIncomplete = applicable.find((s) => !journey.completedSteps.includes(s));
  if (journey.currentStep === step || nextIncomplete === step) return "current";
  return "pending";
}

function HeaderProgress({ journey }: { journey: RentRequestJourney }) {
  const applicable = getApplicableRentSteps(journey.dynamicData);
  const done = applicable.filter((s) =>
    journey.completedSteps.includes(s),
  ).length;
  const total = applicable.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isProgressTerminal = journey.status === "cancelled" || journey.status === "completed";

  return (
    <div className="mt-2.5 flex items-center gap-3">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
        <motion.div
          className={cn(
            "h-full rounded-full",
            pct === 100 ? "bg-emerald-500" : isProgressTerminal ? "bg-slate-400" : "bg-primary",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
}

function RentStepEmailSendsBlock({
  journeyId,
  stepKey,
  onPreviewDeliveryLog,
  previewBusyKey,
}: {
  journeyId: string;
  stepKey: RentJourneyWorkflowStep;
  onPreviewDeliveryLog: (logId: string) => void;
  previewBusyKey: string | null;
}) {
  const { data, isLoading } = useRentStepEmailLogs(journeyId, stepKey);
  const logs = data?.logs ?? [];
  if (isLoading && logs.length === 0) {
    return (
      <p className="mt-2 flex items-center gap-1 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading sent emails…
      </p>
    );
  }
  if (logs.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/80">
        Sent emails ({logs.length})
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
                <span className="text-[10px] font-medium text-foreground">#{idx + 1}</span>
                {when ? (
                  <span className="ml-1.5 text-[9px] tabular-nums text-muted-foreground">
                    {formatDateTimeDDMMYY(when)}
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2 text-[10px] font-normal text-muted-foreground hover:text-foreground"
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

function TimelineRow({
  step,
  state,
  journey,
  journeyId,
  sentAt,
  deliveryStatus,
  onPreview,
  onPreviewDeliveryLog,
  previewLoadingKey,
}: {
  step: RentJourneyWorkflowStep;
  state: "done" | "current" | "pending" | "skipped" | "revision";
  journey: RentRequestJourney;
  journeyId: string;
  sentAt?: string | null;
  deliveryStatus?: string | null;
  onPreview?: () => void;
  onPreviewDeliveryLog?: (logId: string) => void;
  previewLoadingKey?: string | null;
}) {
  const cfg = WORKFLOW_CONFIGS.find((c) => c.stepId === step);
  const Icon = cfg?.icon ?? Circle;
  const sent = state === "done" || state === "revision";
  const eyeBusy = previewLoadingKey === step;
  const requestSent = journey.completedSteps.includes("rent-request");
  const requestDeclined = rentRequestDeclinedPendingResend(journey.dynamicData);
  const requestConfirmed = journey.dynamicData?.requestAckByCustomer === true;
  const agreementSigned = isRentAgreementAccepted(journey.dynamicData);
  const awaitingRequestAck =
    step === "rent-request" &&
    sent &&
    journey.status === "active" &&
    requestSent &&
    !requestConfirmed &&
    !requestDeclined;
  const requestAckDone =
    step === "rent-request" && sent && requestConfirmed;
  const awaitingAgreement =
    step === "rent-agreement" &&
    sent &&
    journey.status === "active" &&
    !agreementSigned &&
    requestConfirmed;
  const agreementDone = step === "rent-agreement" && sent && agreementSigned;
  const isTerminal = journey.status === "cancelled";

  if (state === "skipped") {
    return (
      <div className="relative flex gap-3 opacity-40">
        <div className="relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/20 text-muted-foreground">
          <Icon className="size-3.5" />
        </div>
        <div className="mb-1.5 min-w-0 flex-1 rounded-lg border border-border/30 px-3 py-2">
          <p className="text-[12px] font-semibold text-muted-foreground line-through">
            {RENT_JOURNEY_STEP_LABELS[step]}
          </p>
          <p className="text-[10px] text-muted-foreground">Not applicable for this fulfillment mode</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex gap-3">
      <div
        className={cn(
          "relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
          state === "revision"
            ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 ring-2 ring-amber-400/35"
            : sent
              ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
              : state === "current" && !isTerminal
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 bg-muted/30 text-muted-foreground",
        )}
      >
        {sent ? (
          state === "revision" ? (
            <AlertCircle className="size-3.5" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )
        ) : (
          <Icon className="size-3.5" />
        )}
      </div>

      <div
        className={cn(
          "mb-1.5 flex flex-1 items-stretch justify-between gap-2 rounded-lg border px-3 py-2 transition-all",
          state === "revision"
            ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/45 dark:bg-amber-950/30 ring-1 ring-amber-300/35"
            : sent
              ? "border-emerald-100 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-950/20"
              : state === "current" && !isTerminal
                ? "border-primary/25 bg-primary/5 ring-1 ring-primary/10"
                : "border-border/30 bg-transparent opacity-50",
        )}
      >
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[12px] font-semibold",
              state === "pending" || isTerminal ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {RENT_JOURNEY_STEP_LABELS[step]}
          </p>
          {state === "revision" ? (
            <p className="mt-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-400">
              Customer declined — resend request email with fresh Confirm / Decline links
            </p>
          ) : null}
          {awaitingRequestAck ? (
            <p className="mt-0.5 text-[10px] font-medium text-sky-800 dark:text-sky-400/90">
              Waiting for customer to confirm or decline the rent request email
            </p>
          ) : null}
          {requestAckDone ? (
            <p className="mt-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-400/90">
              Customer confirmed the request — you can send Quote & Agreement when ready
            </p>
          ) : null}
          {awaitingAgreement ? (
            <p className="mt-0.5 text-[10px] font-medium text-sky-800 dark:text-sky-400/90">
              Waiting for customer to sign the rent agreement
            </p>
          ) : null}
          {agreementDone ? (
            <p className="mt-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-400/90">
              Agreement signed — continue with pickup / dispatch steps
            </p>
          ) : null}
          {sentAt ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {formatDateTimeDDMMYY(sentAt)}
              {deliveryStatus ? (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                    deliveryStatus === "sent"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : deliveryStatus === "queued" || deliveryStatus === "processing"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700",
                  )}
                >
                  {deliveryStatus}
                </span>
              ) : null}
            </p>
          ) : null}
          {sent && onPreviewDeliveryLog ? (
            <RentStepEmailSendsBlock
              journeyId={journeyId}
              stepKey={step}
              onPreviewDeliveryLog={onPreviewDeliveryLog}
              previewBusyKey={previewLoadingKey ?? null}
            />
          ) : null}
        </div>
        {sent && onPreview && !onPreviewDeliveryLog ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 self-center text-muted-foreground shadow-none hover:text-primary focus-visible:border-transparent focus-visible:ring-0"
            title="Preview email sent for this step"
            disabled={eyeBusy}
            onClick={onPreview}
          >
            {eyeBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="break-words text-[13px] text-foreground">{value}</div>
    </div>
  );
}

function RentItemChangesPanel({ changes }: { changes: RentItemChangeSet }) {
  if (!hasRentItemChanges(changes)) {
    return (
      <p className="text-[11px] text-muted-foreground italic">
        No item changes — customer kept the original list.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {changes.added.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Added
          </p>
          <div className="space-y-1.5">
            {changes.added.map((item, i) => (
              <div key={`add-${i}`} className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/20">
                <p className="text-[12px] font-medium">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">Qty {item.qty}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {changes.removed.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
            Removed
          </p>
          <div className="space-y-1.5">
            {changes.removed.map((item, i) => (
              <div key={`rem-${i}`} className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 dark:border-red-900 dark:bg-red-950/20">
                <p className="text-[12px] font-medium line-through opacity-80">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">Was qty {item.qty}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {changes.qtyChanged.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Qty changed
          </p>
          <div className="space-y-1.5">
            {changes.qtyChanged.map((item, i) => (
              <div key={`qty-${i}`} className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/20">
                <p className="text-[12px] font-medium">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  Qty {item.from} → {item.to}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepFormFields({
  step,
  journey,
  formData,
  setFormData,
  currency,
  itemRows = [],
  setItemRows,
  discountRows = [],
  setDiscountRows,
}: {
  step: RentJourneyWorkflowStep;
  journey: RentRequestJourney;
  formData: Record<string, string>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  currency: string;
  itemRows?: RentItemLine[];
  setItemRows?: React.Dispatch<React.SetStateAction<RentItemLine[]>>;
  discountRows?: RentDiscountRow[];
  setDiscountRows?: React.Dispatch<React.SetStateAction<RentDiscountRow[]>>;
}) {
  const { data: branding } = useWorkspaceBranding();
  const [customerDetailsExpanded, setCustomerDetailsExpanded] = useState(false);
  const pickupLocations = useMemo(
    () => getBusinessLocations(currency, branding?.businessLocationsByCurrency),
    [currency, branding?.businessLocationsByCurrency],
  );
  const pickupLocationOptions = useMemo(() => {
    const savedId = String(formData.pickupLocationId ?? "").trim();
    const savedLabel = String(formData.pickupLocationLabel ?? "").trim();
    const savedAddress = String(formData.confirmedAddress ?? "").trim();
    if (
      savedId &&
      savedAddress &&
      !pickupLocations.some((loc) => loc.id === savedId || loc.address === savedAddress)
    ) {
      return [
        { id: savedId, label: savedLabel || savedAddress, address: savedAddress },
        ...pickupLocations,
      ];
    }
    return pickupLocations;
  }, [
    pickupLocations,
    formData.pickupLocationId,
    formData.pickupLocationLabel,
    formData.confirmedAddress,
  ]);
  const customerAddressOnFile = String(journey.dynamicData?.customerAddress ?? "").trim();
  const isPickup = String(formData.fulfillmentMode ?? "").toLowerCase() === "pickup";
  const isDelivery = String(formData.fulfillmentMode ?? "").toLowerCase() === "delivery";

  const set = (key: string, val: string) =>
    setFormData((prev) => ({ ...prev, [key]: val }));

  const paymentMethodField = (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground">
        Payment method <span className="text-red-500">*</span>
      </label>
      <select
        value={formData.paymentMethod ?? ""}
        onChange={(e) => set("paymentMethod", e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Select how customer paid…</option>
        {RENT_HANDOVER_PAYMENT_METHODS.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        How the customer paid (deposit + rental fee) at handover — pickup or delivery.
      </p>
    </div>
  );

  function applyPickupLocation(locationId: string) {
    const loc =
      pickupLocationOptions.find((l) => l.id === locationId) ??
      pickupLocations.find((l) => l.id === locationId) ??
      pickupLocations[0];
    if (!loc) return;
    setFormData((prev) => ({
      ...prev,
      pickupLocationId: loc.id,
      pickupLocationLabel: loc.label,
      confirmedAddress: loc.address,
    }));
  }

  function handleFulfillmentChange(mode: string) {
    if (mode === "pickup") {
      const loc = resolveRentPickupSelection(
        journey.dynamicData ?? {},
        currency,
        branding?.businessLocationsByCurrency,
      );
      setFormData((prev) => ({
        ...prev,
        fulfillmentMode: mode,
        pickupLocationId: loc?.id ?? "",
        pickupLocationLabel: loc?.label ?? "",
        confirmedAddress: loc?.address ?? prev.confirmedAddress ?? "",
      }));
      return;
    }

    if (mode === "delivery") {
      const deliveryAddr =
        resolveRentQuoteAddress({
          ...journey.dynamicData,
          fulfillmentMode: "delivery",
        }) || customerAddressOnFile;
      setFormData((prev) => ({
        ...prev,
        fulfillmentMode: mode,
        confirmedAddress: deliveryAddr,
      }));
      return;
    }

    set("fulfillmentMode", mode);
  }

  useEffect(() => {
    if (step !== "rent-agreement") return;
    if (journey.dynamicData?.requestAckByCustomer !== true) return;

    const hydrated = buildRentAgreementFormData(
      journey,
      branding?.businessLocationsByCurrency,
    );
    const items = buildRentAgreementItems(journey);

    setFormData((prev) => {
      const needsSync =
        String(prev.fulfillmentMode ?? "").toLowerCase() !==
          String(hydrated.fulfillmentMode ?? "").toLowerCase() ||
        !prev.confirmedAddress?.trim() ||
        !prev.rentalStartDate?.trim() ||
        !prev.rentalEndDate?.trim() ||
        (String(hydrated.fulfillmentMode ?? "").toLowerCase() === "pickup" &&
          !prev.pickupLocationId?.trim());

      if (!needsSync) return prev;

      return {
        ...prev,
        ...hydrated,
        customMessage: prev.customMessage?.trim() ? prev.customMessage : hydrated.customerMessage ?? "",
      };
    });

    if (setItemRows) {
      setItemRows((prev) => {
        const nextHasNames = items.some((i) => i.name.trim());
        const prevHasNames = prev.some((i) => i.name.trim());
        if (nextHasNames || !prevHasNames) return items;
        return prev;
      });
    }
  }, [
    step,
    journey,
    branding?.businessLocationsByCurrency,
    rentAgreementConfirmSyncKey(journey),
    setItemRows,
  ]);

  const noteField = (
    <StepCustomMessageField
      value={formData.customMessage ?? ""}
      onChange={(v) => set("customMessage", v)}
    />
  );

  const durationDays = computeRentalDurationDays(
    formData.rentalStartDate ?? "",
    formData.rentalEndDate ?? "",
  );

  const agreementTotals = rentQuoteTotals(itemRows, discountRows);
  const { subtotal, discountTotal, total, parsed: parsedDiscounts } = agreementTotals;

  function renderRentAgreementCustomerDetails(expanded: boolean) {
    const labelClass = cn(
      "font-medium text-muted-foreground",
      expanded ? "text-xs" : "text-[11px]",
    );
    const inputClass = cn("mt-1 w-full", expanded ? "h-10 text-[13px]" : "h-9");
    const hintClass = cn("text-muted-foreground", expanded ? "text-xs" : "text-[10px]");
    const sectionHintClass = cn(
      "leading-relaxed text-muted-foreground",
      expanded ? "text-xs" : "text-[11px]",
    );
    const textareaClass = cn(
      "mt-1 resize-y w-full",
      expanded ? "min-h-[100px] text-[13px]" : "min-h-[72px]",
    );
    const selectClass = cn(
      "mt-1 w-full rounded-md border border-input bg-background px-3 focus:outline-none focus:ring-1 focus:ring-ring",
      expanded ? "h-10 text-[13px]" : "h-9 text-[13px]",
    );

    return (
      <div className={cn("space-y-3", expanded && "space-y-4")}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Rental start</label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="DD/MM/YY"
              value={rentDateDisplayValue(formData.rentalStartDate)}
              onChange={(e) => set("rentalStartDate", parseDateToIsoYmd(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Rental end</label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="DD/MM/YY"
              value={rentDateDisplayValue(formData.rentalEndDate)}
              onChange={(e) => set("rentalEndDate", parseDateToIsoYmd(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        {durationDays != null ? (
          <p className={sectionHintClass}>
            Duration:{" "}
            <span className="font-medium text-foreground">
              {formatRentalDurationLabel(durationDays)}
            </span>
          </p>
        ) : null}
        <div>
          <label className={labelClass}>Pickup / Delivery</label>
          <select
            value={String(formData.fulfillmentMode ?? "").toLowerCase()}
            onChange={(e) => handleFulfillmentChange(e.target.value)}
            className={selectClass}
          >
            <option value="">Select…</option>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
        </div>
        {isPickup ? (
          <div>
            <label className={labelClass}>Pickup location</label>
            {pickupLocationOptions.length > 0 ? (
              <>
                <select
                  value={formData.pickupLocationId ?? pickupLocationOptions[0]?.id ?? ""}
                  onChange={(e) => applyPickupLocation(e.target.value)}
                  className={selectClass}
                >
                  {pickupLocationOptions.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.label}
                    </option>
                  ))}
                </select>
                <p className={cn("mt-1.5 rounded-md border border-border bg-background px-2.5 py-2 leading-relaxed text-muted-foreground", hintClass)}>
                  {formData.confirmedAddress || pickupLocationOptions[0]?.address}
                </p>
                <p className={cn("mt-1", hintClass)}>
                  Customer chose pickup — same store locations as on the confirm page ({currency}).
                </p>
              </>
            ) : (
              <Textarea
                value={formData.confirmedAddress ?? ""}
                onChange={(e) => set("confirmedAddress", e.target.value)}
                className={textareaClass}
                placeholder="Pickup address"
              />
            )}
          </div>
        ) : null}
        {isDelivery ? (
          <div>
            <label className={labelClass}>Delivery address</label>
            <Textarea
              value={formData.confirmedAddress ?? ""}
              onChange={(e) => set("confirmedAddress", e.target.value)}
              className={textareaClass}
              placeholder="Customer delivery address"
            />
            {customerAddressOnFile ? (
              <p className={cn("mt-1", hintClass)}>
                From customer confirm — edit if needed before sending quote.
              </p>
            ) : null}
          </div>
        ) : null}
        {!isPickup && !isDelivery ? (
          <div>
            <label className={labelClass}>Address</label>
            <Textarea
              value={formData.confirmedAddress ?? ""}
              onChange={(e) => set("confirmedAddress", e.target.value)}
              className={textareaClass}
            />
          </div>
        ) : null}
        <div>
          <label className={labelClass}>Customer message</label>
          <Textarea
            value={formData.customerMessage ?? ""}
            onChange={(e) => set("customerMessage", e.target.value)}
            className={cn(expanded ? "mt-1 min-h-[88px] text-[13px]" : "mt-1 min-h-[60px]")}
            placeholder="Message from customer confirm step"
          />
        </div>
      </div>
    );
  }

  let fields: React.ReactNode = null;

  switch (step) {
    case "rent-request":
      fields = (
        <>
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Customer details
            </p>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Phone</label>
              <Input
                value={formData.customerPhone ?? ""}
                onChange={(e) => set("customerPhone", e.target.value)}
                placeholder="+971 50 123 4567"
                className="mt-1 h-9"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Address</label>
              <Textarea
                value={formData.customerAddress ?? ""}
                onChange={(e) => set("customerAddress", e.target.value)}
                placeholder="Full address including landmark…"
                rows={2}
                className="mt-1 min-h-[72px] resize-y"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Request date</label>
              <Input
                type="date"
                value={formData.requestDate ?? ""}
                onChange={(e) => set("requestDate", e.target.value)}
                className="mt-1 h-9"
              />
            </div>
          </div>

          {setItemRows ? (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Rental items
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => setItemRows([...itemRows, emptyRentItemLine()])}
                >
                  <Plus className="size-3" /> Add item
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Item names and quantities only — no pricing on the request email.
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[1fr_64px_32px] gap-2 bg-muted/40 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Item</span>
                  <span className="text-center">Qty</span>
                  <span />
                </div>
                <div className="divide-y divide-border">
                  {itemRows.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_64px_32px] gap-2 items-center px-2.5 py-2">
                      <div className="relative min-w-0">
                        <Package className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const next = [...itemRows];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setItemRows(next);
                          }}
                          placeholder="e.g. Projector, Mic, Speaker"
                          className="h-9 pl-8"
                        />
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) => {
                          const next = [...itemRows];
                          next[idx] = {
                            ...next[idx],
                            qty: Math.max(1, parseInt(e.target.value, 10) || 1),
                          };
                          setItemRows(next);
                        }}
                        className="h-9 w-full min-w-0 text-center tabular-nums"
                        aria-label="Qty"
                      />
                      <button
                        type="button"
                        disabled={itemRows.length <= 1}
                        onClick={() => setItemRows(itemRows.filter((_, i) => i !== idx))}
                        className="flex size-8 items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30"
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {!itemRows.some((item) => item.name.trim()) ? (
                <p className="text-[10px] text-amber-600">Add at least one rental item to send.</p>
              ) : null}
            </div>
          ) : null}
        </>
      );
      break;
    case "rent-agreement":
      fields = (
        <>
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Customer details
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setCustomerDetailsExpanded(true)}
              >
                <Maximize2 className="size-3.5" />
                Expand
              </Button>
            </div>
            {renderRentAgreementCustomerDetails(false)}
          </div>

          <Dialog open={customerDetailsExpanded} onOpenChange={setCustomerDetailsExpanded}>
            <DialogContent
              showCloseButton={false}
              className="flex max-h-[min(92vh,880px)] w-[min(96vw,720px)] max-w-none flex-col gap-0 overflow-hidden p-0"
            >
              <DialogHeader className="shrink-0 space-y-0 border-b px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-base font-semibold">Customer details</DialogTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review rental dates, fulfillment, and address before sending the quote.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={() => setCustomerDetailsExpanded(false)}
                  >
                    <Minimize2 className="size-3.5" />
                    Close
                  </Button>
                </div>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {renderRentAgreementCustomerDetails(true)}
              </div>
            </DialogContent>
          </Dialog>

          {setItemRows ? (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Rental items
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Add rate per item — total is calculated automatically.
                </p>
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="divide-y divide-border">
              {itemRows.map((item, idx) => (
                <div key={`${item.name || "row"}-${idx}`} className="space-y-2 px-2.5 py-2.5">
                  <Input
                    value={item.name}
                    onChange={(e) => {
                      const next = [...itemRows];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setItemRows(next);
                    }}
                    placeholder="Item name"
                    className="h-9 w-full"
                  />
                  <div className="grid grid-cols-[72px_1fr_auto] items-center gap-2">
                    <div>
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Qty
                      </p>
                      <Input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) => {
                          const next = [...itemRows];
                          next[idx] = {
                            ...next[idx],
                            qty: Math.max(1, parseInt(e.target.value, 10) || 1),
                          };
                          setItemRows(next);
                        }}
                        className="h-9 w-full text-center tabular-nums"
                        aria-label="Qty"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Rate ({currency})
                      </p>
                      <Input
                        {...MONEY_INPUT_PROPS}
                        value={item.rate}
                        onChange={(e) => {
                          const next = [...itemRows];
                          next[idx] = {
                            ...next[idx],
                            rate: e.target.value,
                          };
                          setItemRows(next);
                        }}
                        placeholder="0"
                        className="h-9 w-full text-right tabular-nums"
                        aria-label="Rate"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={itemRows.length <= 1}
                      onClick={() => setItemRows(itemRows.filter((_, i) => i !== idx))}
                      className="mt-4 flex size-8 items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30"
                      aria-label="Remove item"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setItemRows([...itemRows, emptyRentItemLine()])}
              >
                <Plus className="mr-1 size-3.5" /> Add item
              </Button>
            </div>
          ) : null}

          {setDiscountRows ? (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Discounts
                  </p>
                  <p className="text-[10px] text-muted-foreground">Optional — subtract from subtotal</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setDiscountRows([...discountRows, newRentDiscountRow()])}
                >
                  <Plus className="size-3" /> Add discount
                </Button>
              </div>
              {discountRows.length > 0 ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_5.5rem_2rem] gap-2 bg-muted/40 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Discount</span>
                    <span className="text-right">Amount</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border">
                    {discountRows.map((row) => (
                      <div key={row.id} className="grid grid-cols-[1fr_5.5rem_2rem] gap-2 items-center px-2.5 py-2">
                        <Input
                          value={row.description}
                          onChange={(e) => {
                            setDiscountRows(
                              discountRows.map((r) =>
                                r.id === row.id ? { ...r, description: e.target.value } : r,
                              ),
                            );
                          }}
                          placeholder="e.g. Loyalty, Festival offer"
                          className="h-9 min-w-0"
                        />
                        <Input
                          {...MONEY_INPUT_PROPS}
                          value={row.amount}
                          onChange={(e) => {
                            setDiscountRows(
                              discountRows.map((r) =>
                                r.id === row.id ? { ...r, amount: e.target.value } : r,
                              ),
                            );
                          }}
                          placeholder="0"
                          className="h-9 w-full min-w-0 text-right tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setDiscountRows(discountRows.filter((r) => r.id !== row.id))}
                          className="flex size-8 items-center justify-center text-muted-foreground hover:text-destructive"
                          aria-label="Remove discount"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[10px] text-muted-foreground">
                  No discounts yet. Tap <strong className="text-foreground">Add discount</strong> for offers.
                </p>
              )}
            </div>
          ) : null}

          {subtotal > 0 || discountTotal > 0 ? (
            <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">{currency} {subtotal.toLocaleString("en-IN")}</span>
              </div>
              {parsedDiscounts.length > 0 ? (
                parsedDiscounts.map((discount, idx) => (
                  <div key={`${discount.description}-${discount.amount}-${idx}`} className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-600">{discount.description}</span>
                    <span className="font-medium text-emerald-600 tabular-nums">
                      − {currency} {parseMoneyInput(discount.amount).toLocaleString("en-IN")}
                    </span>
                  </div>
                ))
              ) : null}
              {discountTotal > 0 && parsedDiscounts.length > 1 ? (
                <div className="flex items-center justify-between border-t border-primary/10 pt-1 text-[11px]">
                  <span className="font-medium text-muted-foreground">Total discounts</span>
                  <span className="font-medium text-emerald-600 tabular-nums">
                    − {currency} {discountTotal.toLocaleString("en-IN")}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-[12px] font-semibold">
                <span>Quote total</span>
                <span className="tabular-nums">{currency} {total.toLocaleString("en-IN")}</span>
              </div>
              {discountTotal > 0 && total <= 0 ? (
                <p className="text-[10px] text-amber-600">Discounts cannot exceed subtotal.</p>
              ) : null}
              {subtotal <= 0 ? (
                <p className="text-[10px] text-amber-600">Add a rate on at least one item to send.</p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[10px] text-muted-foreground">
              Enter item rates above — quote total will appear here.
            </p>
          )}

          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Security deposit
            </p>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Amount ({currency})</label>
              <Input {...MONEY_INPUT_PROPS} value={formData.securityDeposit ?? ""} onChange={(e) => set("securityDeposit", e.target.value)} className="mt-1 h-9" placeholder="500" />
            </div>
          </div>
        </>
      );
      break;
    case "rent-ready-pickup":
      fields = (
        <>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Pickup location</label>
            {pickupLocations.length > 0 ? (
              <>
                <select
                  value={
                    pickupLocations.find((l) => l.address === formData.pickupAddress)?.id ??
                    formData.pickupLocationId ??
                    pickupLocations[0]?.id ??
                    ""
                  }
                  onChange={(e) => {
                    const loc = pickupLocations.find((l) => l.id === e.target.value);
                    if (loc) {
                      set("pickupAddress", loc.address);
                      set("pickupLocationLabel", loc.label);
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {pickupLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 rounded-md border border-border bg-background px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  {formData.pickupAddress ?? pickupLocations[0]?.address}
                </p>
              </>
            ) : (
              <Textarea
                value={formData.pickupAddress ?? ""}
                onChange={(e) => set("pickupAddress", e.target.value)}
                className="mt-1 min-h-[72px]"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Pickup date</label>
              <Input value={formData.pickupDate ?? ""} onChange={(e) => set("pickupDate", e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Pickup time</label>
              <Input value={formData.pickupTime ?? ""} onChange={(e) => set("pickupTime", e.target.value)} className="mt-1 h-9" placeholder="10 AM – 6 PM" />
            </div>
          </div>
        </>
      );
      break;
    case "rent-dispatched":
      fields = (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Courier</label>
              <Input value={formData.courierName ?? ""} onChange={(e) => set("courierName", e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Tracking number</label>
              <Input value={formData.trackingNumber ?? ""} onChange={(e) => set("trackingNumber", e.target.value)} className="mt-1 h-9" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Tracking URL</label>
            <Input value={formData.trackingUrl ?? ""} onChange={(e) => set("trackingUrl", e.target.value)} className="mt-1 h-9" placeholder="https://..." />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Estimated delivery</label>
            <Input value={formData.estimatedDelivery ?? ""} onChange={(e) => set("estimatedDelivery", e.target.value)} className="mt-1 h-9" />
          </div>
        </>
      );
      break;
    case "rent-handover":
      fields = (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Rental amount ({currency})</label>
              <Input {...MONEY_INPUT_PROPS} value={formData.rentalAmount ?? ""} onChange={(e) => set("rentalAmount", e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Deposit ({currency})</label>
              <Input {...MONEY_INPUT_PROPS} value={formData.securityDeposit ?? ""} onChange={(e) => set("securityDeposit", e.target.value)} className="mt-1 h-9" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Return due date</label>
            <Input value={formData.returnDueDate ?? ""} onChange={(e) => set("returnDueDate", e.target.value)} className="mt-1 h-9" />
          </div>
          {paymentMethodField}
        </>
      );
      break;
    case "rent-return-reminder":
      fields = (
        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Return due date</label>
          <Input value={formData.returnDueDate ?? ""} onChange={(e) => set("returnDueDate", e.target.value)} className="mt-1 h-9" />
        </div>
      );
      break;
    case "rent-return-received":
      fields = (
        <>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Received at</label>
            <Input value={formData.receivedAt ?? ""} onChange={(e) => set("receivedAt", e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Return condition</label>
            <Textarea value={formData.returnCondition ?? ""} onChange={(e) => set("returnCondition", e.target.value)} className="mt-1 min-h-[72px]" />
          </div>
        </>
      );
      break;
    case "rent-closed":
      fields = (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Deposit refund ({currency})</label>
            <Input {...MONEY_INPUT_PROPS} value={formData.depositRefund ?? ""} onChange={(e) => set("depositRefund", e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">Deduction ({currency})</label>
            <Input {...MONEY_INPUT_PROPS} value={formData.depositDeduction ?? ""} onChange={(e) => set("depositDeduction", e.target.value)} className="mt-1 h-9" />
          </div>
        </div>
      );
      break;
    default:
      break;
  }

  return (
    <div className="space-y-3">
      {fields}
      {noteField}
    </div>
  );
}

export default function RentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : null;

  const { data: journey, isLoading, refetch, isFetching } = useRentJourney(id);
  const { data: branding } = useWorkspaceBranding();
  const { mutateAsync: loadPreview, isPending: previewLoading } = usePreviewRentJourneyEmail();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewStepKey, setPreviewStepKey] = useState("");
  const [previewStepLoading, setPreviewStepLoading] = useState<string | null>(null);
  const [savingFulfillment, setSavingFulfillment] = useState(false);
  const [rightTab, setRightTab] = useState<"actions" | "notes">("actions");
  const previewRunRef = useRef(0);

  const handleSuccess = useCallback(() => { void refetch(); }, [refetch]);

  const openEmailPreview = useCallback(
    async (step: string, extraDynamic?: Record<string, unknown>, logId?: string) => {
      if (!id) return;
      const run = ++previewRunRef.current;
      const loadingKey = logId ? deliveryLogPreviewKey(logId) : step;
      setPreviewStepLoading(loadingKey);
      try {
        const res = logId
          ? await rentService.previewJourneyDeliveryLog(id, logId)
          : await loadPreview({
              id,
              step,
              payload: extraDynamic ? { dynamicData: extraDynamic } : {},
            });
        if (run !== previewRunRef.current) return;
        setPreviewSubject(res.subject);
        setPreviewHtml(res.html);
        setPreviewStepKey(res.stepKey ?? step);
        setPreviewOpen(true);
      } catch {
        toast.error("Could not load email preview");
      } finally {
        if (run === previewRunRef.current) setPreviewStepLoading(null);
      }
    },
    [id, loadPreview],
  );

  const nextStep = useMemo(() => (journey ? resolveRentNextStep(journey) : null), [journey]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertCircle className="size-10 text-muted-foreground" />
        <p className="text-sm font-medium">Request not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push(ROUTES.RENT)}>
          <ArrowLeft className="mr-1.5 size-3.5" /> Back
        </Button>
      </div>
    );
  }

  const fulfillmentMode = String(journey.dynamicData?.fulfillmentMode ?? "");
  const agreementSigned = isRentAgreementAccepted(journey.dynamicData);
  const requestDeclined = journey.dynamicData?.requestAckDeclined === true;
  const requestConfirmed = journey.dynamicData?.requestAckByCustomer === true;
  const staffDeclined = journey.dynamicData?.staffDeclinedRequest === true;
  const declineReason = String(journey.dynamicData?.declineReason ?? "").trim();
  const customerMessage = String(
    journey.dynamicData?.customerMessage ?? journey.dynamicData?.itemsNotes ?? "",
  ).trim();
  const rentalStartDate = String(journey.dynamicData?.rentalStartDate ?? "");
  const rentalEndDate = String(journey.dynamicData?.rentalEndDate ?? "");
  const pickupLocationLabel = String(journey.dynamicData?.pickupLocationLabel ?? "");
  const confirmedAddress = resolveRentQuoteAddress(journey.dynamicData);
  const addressMode = String(journey.dynamicData?.addressMode ?? "");
  const originalItems = parseRentItemLines(journey.dynamicData?.originalRentalItems);
  const confirmedItems = buildRentAgreementItems(journey).filter((i) => i.name.trim());
  const itemChanges: RentItemChangeSet =
    (journey.dynamicData?.customerItemChanges as RentItemChangeSet | undefined) ??
    computeRentItemChanges(originalItems, confirmedItems);
  const items =
    confirmedItems.length > 0
      ? confirmedItems
      : parseRentItemLines(journey.dynamicData?.rentalItems);
  const statusCfg =
    RENT_STATUS_CONFIG[journey.status as keyof typeof RENT_STATUS_CONFIG] ??
    RENT_STATUS_CONFIG.active;
  const moneyHighlight = getRentMoneyHighlight(journey.dynamicData);
  const returnDueInfo = getRentReturnDueInfo(journey);
  const returnDueBadge = rentReturnDueBadgeLabel(returnDueInfo.status);
  const currencySym = CURRENCY_SYMBOL[journey.currency] ?? journey.currency;
  const customerPaymentMethod = String(journey.dynamicData?.paymentMethod ?? "").trim();
  const signedAgreementDownloadData = agreementSigned
    ? rentAgreementDataFromJourney(journey, branding?.companyName)
    : null;

  async function setFulfillmentMode(mode: "pickup" | "delivery") {
    if (!id) return;
    setSavingFulfillment(true);
    try {
      await apiClient.patch(`/rent/journeys/${id}/data`, {
        dynamicData: { fulfillmentMode: mode },
      });
      toast.success(`Fulfillment set to ${mode}`);
      await refetch();
    } catch {
      toast.error("Could not update fulfillment mode");
    } finally {
      setSavingFulfillment(false);
    }
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <div className="shrink-0 border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push(ROUTES.RENT)}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> RENT
              </button>
              <ChevronRight className="size-3 text-border" />
              <code className="text-[12px] font-bold text-foreground">{journey.requestId}</code>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusCfg.cls)}>
                {statusCfg.label}
              </span>
              {nextStep && journey.status === "active" && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Next: {rentStepLabel(nextStep)}
                </span>
              )}
              {!nextStep &&
                rentRequestDeclinedPendingResend(journey.dynamicData) &&
                journey.status === "active" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Resend request needed
                </span>
              )}
              {Boolean(journey.dynamicData?.reminderDue) && !requestConfirmed && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 ring-1 ring-amber-400/30">
                  Reminder due
                </span>
              )}
              {returnDueInfo.followUp && returnDueBadge ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                    rentReturnDueBadgeClass(returnDueInfo.status),
                  )}
                >
                  Return {returnDueBadge.toLowerCase()}
                </span>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            </Button>
          </div>
          <HeaderProgress journey={journey} />
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left — customer + details */}
          <aside className="hidden w-[260px] shrink-0 flex-col overflow-y-auto border-r border-border scrollbar-thin scrollbar-thumb-border lg:flex">
            <div className="space-y-4 p-4">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[14px] font-bold text-primary">
                    {journey.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13px] font-semibold leading-snug text-foreground">{journey.customerName}</p>
                    <p className="break-all text-[11px] leading-snug text-muted-foreground">{journey.customerEmail}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Request Details</p>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-1">
                  <EditableField
                    label="Phone"
                    value={String(journey.dynamicData?.customerPhone ?? "")}
                    fieldKey="customerPhone"
                    journeyId={id!}
                  />
                  <EditableField
                    label="Address"
                    value={String(journey.dynamicData?.customerAddress ?? "")}
                    fieldKey="customerAddress"
                    journeyId={id!}
                  />
                  <EditableField label="Currency" value={journey.currency} fieldKey="currency" journeyId={id!} disabled />
                  <EditableField
                    label="Created"
                    value={formatDateDDMMYY(journey.createdAt)}
                    fieldKey="createdAt"
                    journeyId={id!}
                    disabled
                  />
                  {Object.entries(journey.dynamicData ?? {})
                    .filter(([k]) => !HIDDEN_JOURNEY_DYNAMIC_KEYS.has(k))
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <EditableField key={k} label={k} value={String(v)} fieldKey={k} journeyId={id!} />
                    ))}
                </div>
              </div>

              {moneyHighlight ? (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary/70">
                    {moneyHighlight.label}
                  </p>
                  <p className="text-[22px] font-extrabold leading-none text-primary">
                    {currencySym} {moneyHighlight.display}
                  </p>
                </div>
              ) : null}

              {returnDueInfo.iso ? (
                <div
                  className={cn(
                    "rounded-lg border px-4 py-3",
                    returnDueInfo.followUp
                      ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20"
                      : "border-border bg-muted/20",
                  )}
                >
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Return due
                  </p>
                  <p className="text-[18px] font-extrabold leading-tight text-foreground">
                    {returnDueInfo.label}
                  </p>
                  {returnDueBadge && returnDueInfo.awaitingReturn ? (
                    <span
                      className={cn(
                        "mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        rentReturnDueBadgeClass(returnDueInfo.status),
                      )}
                    >
                      {returnDueBadge}
                    </span>
                  ) : null}
                  {returnDueInfo.awaitingReturn ? (
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                      Equipment is with customer — follow up by call if return is late.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {(journey.attachments ?? []).length > 0 ? (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Paperclip className="size-3" /> Attachments
                  </p>
                  <div className="space-y-1">
                    {(journey.attachments ?? []).map((att: RentJourneyAttachment) => (
                      <a
                        key={att.storedFilename}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px] text-foreground transition-colors hover:bg-muted/40"
                      >
                        <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{att.originalName}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer response</p>
                <DetailField
                  label="Pickup / Delivery"
                  value={
                    requestConfirmed && fulfillmentMode ? (
                      <span className="font-medium capitalize text-emerald-600">{fulfillmentMode}</span>
                    ) : fulfillmentMode ? (
                      <span className="font-medium capitalize text-emerald-600">{fulfillmentMode}</span>
                    ) : (
                      <div className="space-y-2">
                        <span className="text-[12px] italic text-amber-600 dark:text-amber-400">
                          {requestConfirmed ? "Not provided" : "Waiting for customer confirm"}
                        </span>
                        {!requestConfirmed && journey.completedSteps.includes("rent-request") && (
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-[10px]"
                              disabled={savingFulfillment}
                              onClick={() => { void setFulfillmentMode("pickup"); }}
                            >
                              Set Pickup
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-[10px]"
                              disabled={savingFulfillment}
                              onClick={() => { void setFulfillmentMode("delivery"); }}
                            >
                              Set Delivery
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  }
                />
                {requestDeclined && staffDeclined && declineReason ? (
                  <DetailField
                    label="Decline reason"
                    value={<span className="text-amber-700 dark:text-amber-400">{declineReason}</span>}
                  />
                ) : null}
                {requestConfirmed ? (
                  <>
                    <DetailField label="Status" value={<span className="font-medium text-emerald-600">Confirmed ✓</span>} />
                    {rentalStartDate && rentalEndDate ? (
                      <DetailField
                        label="Rental period"
                        value={`${formatDateDDMMYY(rentalStartDate)} → ${formatDateDDMMYY(rentalEndDate)}`}
                      />
                    ) : null}
                    {returnDueInfo.iso ? (
                      <DetailField
                        label="Return due"
                        value={
                          <span className="font-semibold text-foreground">{returnDueInfo.label}</span>
                        }
                      />
                    ) : null}
                    {confirmedAddress ? (
                      <DetailField
                        label={
                          fulfillmentMode === "pickup"
                            ? pickupLocationLabel
                              ? `Pickup — ${pickupLocationLabel}`
                              : "Pickup location"
                            : addressMode === "different"
                              ? "Delivery address (updated)"
                              : "Delivery address"
                        }
                        value={confirmedAddress}
                      />
                    ) : null}
                    {customerMessage ? (
                      <DetailField label="Message" value={customerMessage} />
                    ) : null}
                    <RentItemChangesPanel changes={itemChanges} />
                  </>
                ) : null}
                {requestDeclined && !requestConfirmed ? (
                  <DetailField
                    label="Status"
                    value={<span className="font-medium text-red-600">Declined ✗</span>}
                  />
                ) : null}
                {agreementSigned ? (
                  <>
                    <DetailField label="Agreement" value={<span className="text-emerald-600">Signed ✓</span>} />
                    {String(journey.dynamicData?.agreementSignerName ?? "").trim() ? (
                      <DetailField
                        label="Signed by"
                        value={String(journey.dynamicData?.agreementSignerName)}
                      />
                    ) : null}
                    {String(journey.dynamicData?.agreementSignedDateDisplay ?? "").trim() ? (
                      <DetailField
                        label="Signed on"
                        value={String(journey.dynamicData?.agreementSignedDateDisplay)}
                      />
                    ) : null}
                    {String(journey.dynamicData?.agreementSignatureImage ?? "").trim() ? (
                      <div className="pt-1">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          E-signature
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={String(journey.dynamicData?.agreementSignatureImage)}
                          alt="Customer signature"
                          className="max-h-12 rounded border border-border bg-white p-1"
                        />
                      </div>
                    ) : null}
                    {signedAgreementDownloadData ? (
                      <RentSignedAgreementDownload
                        data={signedAgreementDownloadData}
                        className="pt-2"
                      />
                    ) : null}
                  </>
                ) : null}
                {customerPaymentMethod ? (
                  <DetailField label="Payment method" value={customerPaymentMethod} />
                ) : null}
              </div>

              {items.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {requestConfirmed ? "Confirmed items" : "Rental items"}
                  </p>
                  {items.map((item, i) => (
                    <div key={i} className="rounded-lg border border-border bg-background px-3 py-2">
                      <p className="text-[12px] font-medium">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground">Qty {item.qty}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>

          {/* Center — timeline + activity */}
          <div
            className="flex flex-1 flex-col overflow-y-auto border-r border-border p-4 scrollbar-thin scrollbar-thumb-border"
            data-dashboard-primary-scroll=""
          >
            <div className="space-y-5">
              <div>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Journey Timeline
                </p>
                <div className="space-y-0">
                  {RENT_JOURNEY_WORKFLOW_STEPS.map((step) => {
                    const sent = journey.sentSteps.find((s) => s.stepKey === step);
                    const state = stepState(journey, step);
                    const wasSent = state === "done" || state === "revision";
                    return (
                      <TimelineRow
                        key={step}
                        step={step}
                        state={state}
                        journey={journey}
                        journeyId={id!}
                        sentAt={sent?.sentAt}
                        deliveryStatus={sent?.deliveryStatus}
                        onPreviewDeliveryLog={
                          wasSent && id
                            ? (logId) => { void openEmailPreview(step, undefined, logId); }
                            : undefined
                        }
                        previewLoadingKey={previewStepLoading}
                      />
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="size-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Customer Activity
                  </p>
                </div>
                {id ? <ActivityFeed journeyId={id} /> : null}
              </div>
            </div>
          </div>

          {/* Right — actions + notes */}
          <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-border bg-card">
            <div className="flex shrink-0 border-b border-border">
              <button
                type="button"
                onClick={() => setRightTab("actions")}
                className={cn(
                  "flex-1 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  rightTab === "actions"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Actions
              </button>
              <button
                type="button"
                onClick={() => setRightTab("notes")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
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
            <div className="flex-1 overflow-y-auto p-4">
              {rightTab === "actions" && id ? (
                <RentActionPanel
                  journey={journey}
                  id={id}
                  onSuccess={handleSuccess}
                  previewEmail={(step, extra, logId) => { void openEmailPreview(step, extra, logId); }}
                  previewBusy={previewLoading || previewStepLoading !== null}
                />
              ) : (
                <StaffNotesPanel journey={journey} onRefresh={handleSuccess} />
              )}
            </div>
          </aside>
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
              <p className="text-[11px] font-medium text-foreground">{rentStepLabel(previewStepKey)}</p>
            ) : null}
            <p className="break-all text-[11px] text-muted-foreground">{previewSubject}</p>
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
