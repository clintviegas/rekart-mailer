"use client";

import { useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, RotateCcw, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, ChevronRight, Activity, CalendarPlus, Send,
  Calendar, Package, StickyNote, Trash2, Plus, Eye, XCircle,
  BadgeCheck, Recycle, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  formatDateDDMMYY,
  formatDateTimeDDMMYY,
  formatPickupDateForEmail,
  parsePickupDateToIso,
  isoYmdToDisplay,
} from "@/lib/date-format";
import { toast } from "sonner";
import {
  useRecycleJourney,
  useSendRecycleJourneyStep,
  useResendRecycleJourneyStep,
  useRecycleJourneyActions,
  useCancelRecycleJourney,
  useUpdateRecycleJourneyData,
  usePreviewJourneyEmail,
} from "@/hooks/use-recycle-journeys";
import { recycleService } from "@/services/recycle.service";
import {
  RECYCLE_JOURNEY_WORKFLOW_STEPS,
  RECYCLE_JOURNEY_STEP_LABELS,
  RecycleJourneyStepLabel,
  type RecycleJourneyWorkflowStep,
  type RecycleRequestJourney,
  type JourneyStatus,
  type RecycleJourneyAction,
  type JourneyActionType,
  type StaffNote,
} from "@/types/recycle";
import { RECYCLE_STATUS_CONFIG } from "@/modules/recycle/constants";
import {
  formatRecycleQty,
  buildRecycleDynamicDataFromForm,
  RECYCLE_ASSET_CATEGORIES,
  RECYCLE_BULK_ESTIMATE_OPTIONS,
  type RecycleItemLine,
  type RecycleBulkCategoryLine,
  type RecycleCollectionMode,
  type RecycleBulkEstimateBand,
} from "@/modules/recycle/recycle-items";
import { RECYCLE_COLLECTION_MODE_OPTIONS } from "@/modules/recycle/constants";
import {
  SELL_EMAIL_PREVIEW_DIALOG_CLASS,
  SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS,
  SELL_EMAIL_PREVIEW_IFRAME_CLASS,
} from "@/constants/sell-email-preview";
import {
  isRepairPickupTimeAny,
  parseRepairPickupTimeWindowToHm,
  readCustomerPreferredPickupTimeSlot,
  readCustomerPreferredPickupDate,
} from "@/lib/repair-pickup-time-windows";

// ── State machine ─────────────────────────────────────────────────────────────

interface NextAction {
  label: string;
  description: string;
  nextStep: RecycleJourneyWorkflowStep;
  Icon: React.FC<{ className?: string }>;
  variant: "primary" | "success";
}

const SEND_REQUEST_EMAIL_ACTION: NextAction = {
  label: "Send Recycle Request Email",
  description: "Review what was filled in, edit if needed, then send the confirmation email",
  nextStep: "recycle-request",
  Icon: Send,
  variant: "primary",
};

const NEXT_ACTION: Partial<Record<RecycleJourneyWorkflowStep, NextAction>> = {
  "recycle-request": {
    label: "Schedule Pickup",
    description: "Send pickup date, time window, and agent details",
    nextStep: "pickup-scheduled",
    Icon: CalendarPlus,
    variant: "primary",
  },
  "pickup-scheduled": {
    label: "Schedule Pickup",
    description: "Send or update pickup schedule details",
    nextStep: "pickup-scheduled",
    Icon: CalendarPlus,
    variant: "primary",
  },
  "devices-collected": {
    label: "Confirm Devices Collected",
    description: "Record actual items collected and notify the customer",
    nextStep: "devices-collected",
    Icon: Package,
    variant: "primary",
  },
  "certificate-issued": {
    label: "Issue Certificate",
    description: "Send recycling certificate to the customer",
    nextStep: "certificate-issued",
    Icon: BadgeCheck,
    variant: "success",
  },
};

const RESEND_ALLOWED = new Set<string>(RECYCLE_JOURNEY_WORKFLOW_STEPS);

function journeyTimelineStepSent(j: RecycleRequestJourney, step: string): boolean {
  return j.completedSteps.includes(step as RecycleJourneyWorkflowStep);
}

function requestAckEffectiveGen(j: RecycleRequestJourney): number {
  const gen = (j as RecycleRequestJourney & { requestAckGeneration?: number }).requestAckGeneration;
  if (typeof gen === "number" && gen > 0) return gen;
  if (j.completedSteps.includes("recycle-request")) return 1;
  return 0;
}

function customerAcknowledgedCurrentRequest(j: RecycleRequestJourney): boolean {
  const dd = j.dynamicData as Record<string, unknown> | undefined;
  if (!dd || dd.requestAckByCustomer !== true) return false;
  const gen = requestAckEffectiveGen(j);
  const ag = dd.requestAckAcceptedGen;
  if (typeof ag === "number" && ag > 0) return ag === gen;
  return gen <= 1;
}

const PICKUP_INPUT_CLASS =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary";

function padHm(h: string, mi: string): string {
  return `${h.padStart(2, "0")}:${mi.padStart(2, "0")}`;
}

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

function splitSavedTimeWindow(saved: string): { from: string; to: string } {
  const s = saved.trim();
  const m = s.match(/^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/);
  if (!m) return { from: "", to: "" };
  const norm = (part: string) => {
    const [h, mi] = part.split(":");
    return padHm(h, mi ?? "00");
  };
  return { from: norm(m[1]), to: norm(m[2]) };
}

function timeHmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map((x) => Number(x));
  if (Number.isNaN(h)) return NaN;
  return h * 60 + (m || 0);
}

function StatusBadge({ status }: { status: JourneyStatus }) {
  const c = RECYCLE_STATUS_CONFIG[status as keyof typeof RECYCLE_STATUS_CONFIG] ?? RECYCLE_STATUS_CONFIG.active;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", c.cls)}>
      {c.label}
    </span>
  );
}

function readDynStr(d: Record<string, unknown>, key: string): string {
  const v = d[key];
  return v != null ? String(v).trim() : "";
}

function parseInitialRecycleItems(d: Record<string, unknown>): RecycleItemLine[] {
  const raw = d.recycleItems;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((row) => {
      const r = row as Record<string, unknown>;
      const qtyRaw = r.qty;
      const qty =
        qtyRaw === "unknown" || qtyRaw == null || qtyRaw === ""
          ? ("unknown" as const)
          : Math.max(1, Number(qtyRaw) || 1);
      return { name: String(r.name ?? ""), qty };
    });
  }
  return [{ name: "", qty: 1 }];
}

function parseInitialBulkCategories(d: Record<string, unknown>): RecycleBulkCategoryLine[] {
  const raw = d.bulkCategories;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((row) => {
      const r = row as Record<string, unknown>;
      const qtyRaw = r.qty;
      const qty =
        qtyRaw === "unknown" || qtyRaw == null || qtyRaw === ""
          ? ("unknown" as const)
          : Math.max(1, Number(qtyRaw) || 1);
      return { category: String(r.category ?? RECYCLE_ASSET_CATEGORIES[0]), qty };
    });
  }
  return [{ category: RECYCLE_ASSET_CATEGORIES[0], qty: "unknown" }];
}

function StepCustomMessageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">
        Custom message for the customer <span className="text-[10px] opacity-60">(optional)</span>
      </label>
      <textarea
        placeholder="Shows in the email in a highlighted box. Leave empty to hide."
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px]"
      />
    </div>
  );
}

function RecycleRequestForm({
  initial,
  onConfirm,
  onCancel,
  onPreview,
}: {
  initial: Record<string, unknown>;
  onConfirm: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, unknown>) => void;
}) {
  const [collectionMode, setCollectionMode] = useState<RecycleCollectionMode>(
    () => (readDynStr(initial, "collectionMode") as RecycleCollectionMode) || "listed",
  );
  const [items, setItems] = useState<RecycleItemLine[]>(() => parseInitialRecycleItems(initial));
  const [bulkEstimate, setBulkEstimate] = useState<string>(
    () => readDynStr(initial, "bulkEstimate") || "unknown",
  );
  const [bulkDescription, setBulkDescription] = useState(() => readDynStr(initial, "bulkDescription"));
  const [bulkCategories, setBulkCategories] = useState<RecycleBulkCategoryLine[]>(
    () => parseInitialBulkCategories(initial),
  );
  const [pickupAddress, setPickupAddress] = useState(() => readDynStr(initial, "pickupAddress"));
  const [collectionNotes, setCollectionNotes] = useState(() => readDynStr(initial, "collectionNotes"));
  const [requestDateIso, setRequestDateIso] = useState(
    () => parsePickupDateToIso(readDynStr(initial, "requestDate")) || new Date().toISOString().split("T")[0],
  );
  const [customMessage, setCustomMessage] = useState(() => readDynStr(initial, "customMessage"));

  const requestDateLabel = formatPickupDateForEmail(requestDateIso);
  const listedValid = collectionMode !== "listed" || items.some((i) => i.name.trim());
  const bulkValid =
    collectionMode !== "bulk_estimate" ||
    bulkDescription.trim().length > 0 ||
    bulkCategories.some((c) => c.category.trim());
  const canSend = Boolean(requestDateLabel) && listedValid && bulkValid;

  function payload(): Record<string, unknown> {
    const base = buildRecycleDynamicDataFromForm({
      collectionMode,
      recycleItems: items,
      bulkEstimate: bulkEstimate as RecycleBulkEstimateBand,
      bulkDescription,
      bulkCategories,
      pickupAddress,
      collectionNotes,
    });
    if (requestDateIso) base.requestDate = isoYmdToDisplay(requestDateIso) || requestDateLabel;
    if (customMessage.trim()) base.customMessage = customMessage.trim();
    return base;
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Request details (review &amp; edit)</p>
      <p className="text-[11px] text-muted-foreground">
        Confirm what the customer will see in the Recycle Request email. Edit anything before sending.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {RECYCLE_COLLECTION_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setCollectionMode(opt.value)}
            className={cn(
              "rounded-lg border px-2.5 py-2 text-left text-[10px] font-medium transition-all",
              collectionMode === opt.value
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {collectionMode === "listed" ? (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_72px_28px] gap-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) =>
                  setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row)))
                }
                placeholder="Item name — MacBook Pro, Monitor…"
                className={PICKUP_INPUT_CLASS}
              />
              <input
                value={item.qty === "unknown" ? "" : String(item.qty)}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const qty = raw === "" ? "unknown" : Math.max(1, Number(raw) || 1);
                  setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, qty } : row)));
                }}
                placeholder="Qty"
                className={PICKUP_INPUT_CLASS}
              />
              <button
                type="button"
                disabled={items.length <= 1}
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                className="flex h-9 items-center justify-center rounded-md border border-border text-muted-foreground disabled:opacity-30"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => setItems((prev) => [...prev, { name: "", qty: 1 }])}
          >
            + Add item
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">Estimated volume</label>
            <select
              value={bulkEstimate}
              onChange={(e) => setBulkEstimate(e.target.value)}
              className={PICKUP_INPUT_CLASS}
            >
              {RECYCLE_BULK_ESTIMATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {bulkCategories.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_72px] gap-2">
                <select
                  value={row.category}
                  onChange={(e) =>
                    setBulkCategories((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, category: e.target.value } : r)),
                    )
                  }
                  className={PICKUP_INPUT_CLASS}
                >
                  {RECYCLE_ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  value={row.qty === "unknown" ? "" : String(row.qty)}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const qty = raw === "" ? "unknown" : Math.max(1, Number(raw) || 1);
                    setBulkCategories((prev) => prev.map((r, i) => (i === idx ? { ...r, qty } : r)));
                  }}
                  placeholder="Qty"
                  className={PICKUP_INPUT_CLASS}
                />
              </div>
            ))}
          </div>
          <textarea
            value={bulkDescription}
            onChange={(e) => setBulkDescription(e.target.value)}
            placeholder="Office clearance — floor 3 IT room, mix of laptops and monitors…"
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px]"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Pickup address</label>
        <textarea
          rows={2}
          value={pickupAddress}
          onChange={(e) => setPickupAddress(e.target.value)}
          placeholder="Building, area, city"
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Notes for collection team</label>
        <input
          value={collectionNotes}
          onChange={(e) => setCollectionNotes(e.target.value)}
          placeholder="Reception desk, loading bay, access code…"
          className={PICKUP_INPUT_CLASS}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Request date</label>
        <input
          type="date"
          value={requestDateIso}
          onChange={(e) => setRequestDateIso(e.target.value)}
          className={cn(PICKUP_INPUT_CLASS, "[color-scheme:light] dark:[color-scheme:dark]")}
        />
      </div>
      <StepCustomMessageField value={customMessage} onChange={setCustomMessage} />

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 min-w-[88px] flex-1 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        {onPreview && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 min-w-[88px] flex-1 gap-1 text-xs"
            disabled={!canSend}
            onClick={() => onPreview(payload())}
          >
            <Eye className="size-3" /> Preview
          </Button>
        )}
        <Button
          size="sm"
          className="h-7 min-w-[88px] flex-1 text-xs"
          disabled={!canSend}
          onClick={() => onConfirm(payload())}
        >
          Send request email
        </Button>
      </div>
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

function PickupForm({
  initial,
  onConfirm,
  onCancel,
  onPreview,
}: {
  initial: Record<string, unknown>;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
  onPreview?: (data: Record<string, string>) => void;
}) {
  const read = (k: string) => String(initial[k] ?? "");
  const customerPreferredSlot = readCustomerPreferredPickupTimeSlot(initial);
  const customerPreferredDateIso = readCustomerPreferredPickupDate(initial);
  const customerPreferredHm =
    customerPreferredSlot && !isRepairPickupTimeAny(customerPreferredSlot)
      ? parseRepairPickupTimeWindowToHm(customerPreferredSlot)
      : null;
  const savedWindow = splitSavedTimeWindow(read("pickupTime"));
  const [dateIso, setDateIso] = useState(
    () => parsePickupDateToIso(read("pickupDate")) || customerPreferredDateIso || "",
  );
  const [timeFrom, setTimeFrom] = useState(() => savedWindow.from || customerPreferredHm?.from || "");
  const [timeTo, setTimeTo] = useState(() => savedWindow.to || customerPreferredHm?.to || "");
  const [pickupAddress, setPickupAddress] = useState(() => read("pickupAddress"));
  const [agentName, setAgentName] = useState(() => read("agentName"));
  const [agentPhone, setAgentPhone] = useState(() => read("agentPhone"));
  const [customMessage, setCustomMessage] = useState(() => read("customMessage"));

  const pickupDateLabel = formatPickupDateForEmail(dateIso);
  const pickupTimeLabel = buildTimeWindowForEmail(timeFrom, timeTo);
  const fromM = timeHmToMinutes(timeFrom);
  const toM = timeHmToMinutes(timeTo);
  const windowOk = dateIso && timeFrom && timeTo && Number.isFinite(fromM) && Number.isFinite(toM) && toM > fromM;
  const canSend = Boolean(pickupDateLabel) && windowOk && pickupAddress.trim();

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
    <div className="rounded-xl border border-emerald-300/80 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pickup schedule</p>
      {(customerPreferredSlot || customerPreferredDateIso) && (
        <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2 text-[11px] text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-100">
          Customer preference:
          {customerPreferredDateIso ? ` ${formatDateDDMMYY(customerPreferredDateIso)}` : ""}
          {customerPreferredSlot ? ` · ${customerPreferredSlot}` : ""}
        </div>
      )}
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Pickup date</label>
        <input type="date" value={dateIso} onChange={(e) => setDateIso(e.target.value)} className={cn(PICKUP_INPUT_CLASS, "pl-2 [color-scheme:light] dark:[color-scheme:dark]")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">From</label>
          <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} className={PICKUP_INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">To</label>
          <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} className={PICKUP_INPUT_CLASS} />
        </div>
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Pickup address</label>
        <textarea rows={2} value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Agent name</label>
          <input value={agentName} onChange={(e) => setAgentName(e.target.value)} className={PICKUP_INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Agent phone</label>
          <input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} className={PICKUP_INPUT_CLASS} />
        </div>
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Custom message (optional)</label>
        <textarea rows={2} value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px]" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        {onPreview && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={!canSend} onClick={() => onPreview(payload())}>
            <Eye className="size-3 mr-1" /> Preview
          </Button>
        )}
        <Button size="sm" className="h-8 flex-1 text-xs" disabled={!canSend} onClick={() => onConfirm(payload())}>
          Send pickup email
        </Button>
      </div>
    </div>
  );
}

function CollectedForm({
  initial,
  onConfirm,
  onCancel,
}: {
  initial: Record<string, unknown>;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const read = (k: string) => String(initial[k] ?? "");
  const [collectedDate, setCollectedDate] = useState(() => parsePickupDateToIso(read("collectedDate")) || "");
  const [collectedBy, setCollectedBy] = useState(() => read("collectedBy"));
  const [actualTotalQty, setActualTotalQty] = useState(() => read("actualTotalQty"));
  const [actualItemsSummary, setActualItemsSummary] = useState(() => {
    if (read("actualItemsSummary")) return read("actualItemsSummary");
    return read("recycleItemsSummary");
  });
  const [customMessage, setCustomMessage] = useState(() => read("customMessage"));

  const canSend = collectedDate && actualItemsSummary.trim();

  function payload(): Record<string, string> {
    return {
      collectedDate: formatPickupDateForEmail(collectedDate),
      collectedBy: collectedBy.trim(),
      actualTotalQty: actualTotalQty.trim(),
      actualItemsSummary: actualItemsSummary.trim(),
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-indigo-300/80 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Devices collected</p>
      <p className="text-[11px] text-muted-foreground">Record what was actually picked up — especially for bulk/office clearances where the estimate was TBD.</p>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Collection date</label>
        <input type="date" value={collectedDate} onChange={(e) => setCollectedDate(e.target.value)} className={PICKUP_INPUT_CLASS} />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Collected by</label>
        <input value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} className={PICKUP_INPUT_CLASS} placeholder="Field agent name" />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Actual items summary</label>
        <textarea rows={3} value={actualItemsSummary} onChange={(e) => setActualItemsSummary(e.target.value)} placeholder="e.g. MacBook Pro ×2, Dell Monitor ×5" className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px]" />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Total quantity (optional)</label>
        <input value={actualTotalQty} onChange={(e) => setActualTotalQty(e.target.value)} className={PICKUP_INPUT_CLASS} placeholder="e.g. 7" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-8 flex-1 text-xs" disabled={!canSend} onClick={() => onConfirm(payload())}>
          Send collected email
        </Button>
      </div>
    </div>
  );
}

function CertificateForm({
  initial,
  onConfirm,
  onCancel,
}: {
  initial: Record<string, unknown>;
  onConfirm: (data: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const read = (k: string) => String(initial[k] ?? "");
  const [certificateNumber, setCertificateNumber] = useState(() => read("certificateNumber"));
  const [certificateIssuedDate, setCertificateIssuedDate] = useState(
    () => parsePickupDateToIso(read("certificateIssuedDate")) || "",
  );
  const [certificateUrl, setCertificateUrl] = useState(() => read("certificateUrl"));
  const [customMessage, setCustomMessage] = useState(() => read("customMessage"));

  const canSend = certificateNumber.trim() && certificateIssuedDate;

  function payload(): Record<string, string> {
    return {
      certificateNumber: certificateNumber.trim(),
      certificateIssuedDate: formatPickupDateForEmail(certificateIssuedDate),
      certificateUrl: certificateUrl.trim(),
      customMessage: customMessage.trim(),
    };
  }

  return (
    <div className="rounded-xl border border-teal-300/80 bg-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Recycling certificate</p>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Certificate number</label>
        <input value={certificateNumber} onChange={(e) => setCertificateNumber(e.target.value)} className={PICKUP_INPUT_CLASS} placeholder="RC-2026-00123" />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Issue date</label>
        <input type="date" value={certificateIssuedDate} onChange={(e) => setCertificateIssuedDate(e.target.value)} className={PICKUP_INPUT_CLASS} />
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-1">Certificate URL (optional)</label>
        <input value={certificateUrl} onChange={(e) => setCertificateUrl(e.target.value)} className={PICKUP_INPUT_CLASS} placeholder="https://…" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-8 flex-1 text-xs bg-teal-600 hover:bg-teal-700" disabled={!canSend} onClick={() => onConfirm(payload())}>
          Send certificate email
        </Button>
      </div>
    </div>
  );
}

// ── Timeline & activity ───────────────────────────────────────────────────────

const ACTION_META: Partial<Record<JourneyActionType, { icon: string; label: string; color: string }>> = {
  mail_opened: { icon: "📬", label: "Email Opened", color: "text-blue-700" },
  mail_clicked: { icon: "🖱️", label: "Link Clicked", color: "text-blue-700" },
  track_clicked: { icon: "📍", label: "Tracked Request", color: "text-violet-700" },
  reschedule_requested: { icon: "📅", label: "Reschedule Requested", color: "text-amber-700" },
  recycle_request_accepted: { icon: "✅", label: "Request Confirmed", color: "text-emerald-700" },
  recycle_request_declined: { icon: "✖️", label: "Request Declined", color: "text-orange-700" },
  request_received_accepted: { icon: "✅", label: "Request Confirmed", color: "text-emerald-700" },
  request_received_declined: { icon: "✖️", label: "Request Declined", color: "text-orange-700" },
  rating_submitted: { icon: "⭐", label: "Rating Submitted", color: "text-amber-700" },
  support_requested: { icon: "💬", label: "Support Requested", color: "text-indigo-700" },
  journey_auto_closed: { icon: "⏱️", label: "Auto-closed", color: "text-slate-600" },
};

function TimelineStep({
  stepKey,
  idx,
  journey,
  onPreview,
  previewLoading,
}: {
  stepKey: RecycleJourneyWorkflowStep;
  idx: number;
  journey: RecycleRequestJourney;
  onPreview?: (step: string) => void;
  previewLoading?: string | null;
}) {
  const sent = journeyTimelineStepSent(journey, stepKey);
  const requestDeclined = journey.status === "request_declined";
  const requestAckGen = requestAckEffectiveGen(journey);
  let current = journey.currentStep === stepKey && !sent;
  const awaitingRequestAck =
    stepKey === "recycle-request" &&
    sent &&
    journey.status === "active" &&
    requestAckGen > 0 &&
    !customerAcknowledgedCurrentRequest(journey);
  const needsRequestRevision = requestDeclined && stepKey === "recycle-request" && sent;
  const requestAckDone =
    stepKey === "recycle-request" &&
    sent &&
    requestAckGen > 0 &&
    customerAcknowledgedCurrentRequest(journey);
  const dd = journey.dynamicData as Record<string, unknown> | undefined;
  const confirmedPickupAddress = dd?.pickupAddress ? String(dd.pickupAddress) : "";
  const originalRequestAddress = dd?.requestPickupAddress ? String(dd.requestPickupAddress) : "";
  const addressChanged = dd?.pickupAddressSameAsRequest === false && !!originalRequestAddress;
  const last = idx === RECYCLE_JOURNEY_WORKFLOW_STEPS.length - 1;
  const record = journey.sentSteps?.find((s) => s.stepKey === stepKey);
  const eyeBusy = previewLoading === stepKey;

  return (
    <div className="relative flex gap-3">
      {!last && (
        <div className={cn("absolute left-[13px] top-[28px] w-px", sent ? "bg-emerald-300" : "bg-border/40")} style={{ height: "calc(100% + 4px)" }} />
      )}
      <div className={cn(
        "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
        needsRequestRevision ? "border-amber-500 bg-amber-50 text-amber-700" :
        sent ? "border-emerald-500 bg-emerald-50 text-emerald-600" :
        current ? "border-primary bg-primary/10 text-primary" :
        "border-border/60 bg-muted/30 text-muted-foreground",
      )}>
        {sent ? <CheckCircle2 className="size-3.5" /> : <span>{idx + 1}</span>}
      </div>
      <div className={cn(
        "mb-1.5 flex flex-1 items-stretch justify-between gap-2 rounded-lg border px-3 py-2",
        needsRequestRevision ? "border-amber-200 bg-amber-50/70" :
        sent ? "border-emerald-100 bg-emerald-50/50" :
        current ? "border-primary/25 bg-primary/5" :
        "border-border/30 opacity-50",
      )}>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold">{RECYCLE_JOURNEY_STEP_LABELS[stepKey]}</p>
          {needsRequestRevision && (
            <p className="text-[10px] font-medium text-amber-800 mt-0.5">Customer declined — resend request email or cancel</p>
          )}
          {awaitingRequestAck && (
            <p className="text-[10px] font-medium text-sky-800 mt-0.5">Waiting for customer to confirm pickup in the email</p>
          )}
          {requestAckDone && (
            <>
              <p className="text-[10px] font-medium text-emerald-800 mt-0.5">
                Customer confirmed pickup — you can send Pickup Scheduled when ready
              </p>
              {confirmedPickupAddress ? (
                <p className="text-[10px] font-medium text-emerald-800/90 mt-0.5">
                  Pickup address: {confirmedPickupAddress}
                  {addressChanged ? " (updated from request)" : ""}
                </p>
              ) : null}
            </>
          )}
          {record && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatDateTimeDDMMYY(record.sentAt)}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase">{record.deliveryStatus}</span>
            </p>
          )}
        </div>
        {sent && onPreview && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={eyeBusy} onClick={() => onPreview(stepKey)}>
            {eyeBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function ActivityFeed({ journeyId }: { journeyId: string }) {
  const { data: actions, isLoading } = useRecycleJourneyActions(journeyId);
  if (isLoading) return <p className="text-xs text-muted-foreground py-3 text-center">Loading…</p>;
  if (!actions?.length) return (
    <p className="text-xs text-muted-foreground py-3 text-center">No customer interactions yet.</p>
  );
  return (
    <div className="space-y-1.5">
      {actions.map((a: RecycleJourneyAction) => {
        const m = ACTION_META[a.actionType] ?? { icon: "•", label: a.actionType, color: "text-muted-foreground" };
        return (
          <div key={a._id} className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
            <span className="mt-0.5 shrink-0">{m.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("font-semibold", m.color)}>{m.label}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTimeDDMMYY(a.createdAt)}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{RecycleJourneyStepLabel(a.step)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StaffNotesPanel({ journey, onRefresh }: { journey: RecycleRequestJourney; onRefresh: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const notes: StaffNote[] = journey.staffNotes ?? [];

  async function handleAdd() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await recycleService.addStaffNote(journey._id, text.trim());
      setText("");
      onRefresh();
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add internal note…"
        rows={3}
        maxLength={2000}
        className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px]"
      />
      <Button size="sm" className="h-7 self-end text-[11px]" disabled={!text.trim() || saving} onClick={handleAdd}>
        {saving ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3 mr-1" />}
        Add note
      </Button>
      {notes.length === 0 ? (
        <p className="text-center text-[11px] text-muted-foreground py-3">No notes yet.</p>
      ) : (
        notes.map((n, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-[12px] whitespace-pre-wrap">{n.text}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{formatDateTimeDDMMYY(n.createdAt)}</p>
          </div>
        ))
      )}
    </div>
  );
}

function ActionPanel({
  journey,
  id,
  onSuccess,
  previewEmail,
}: {
  journey: RecycleRequestJourney;
  id: string;
  onSuccess: () => void;
  previewEmail: (step: string, extra?: Record<string, unknown>) => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState<"request" | "pickup" | "collected" | "certificate" | null>(null);
  const { mutate: sendStep } = useSendRecycleJourneyStep();
  const { mutate: resendMutate } = useResendRecycleJourneyStep();
  const { mutate: updateData } = useUpdateRecycleJourneyData();
  const { mutate: cancelMutate, isPending: cancelling } = useCancelRecycleJourney();

  const isTerminal = ["completed", "cancelled", "no_customer_action"].includes(journey.status);
  const firstEmailSent = journey.completedSteps.includes("recycle-request");
  const requestDeclined = journey.status === "request_declined";
  const requestAckGen = requestAckEffectiveGen(journey);
  const pickupBlocked =
    journey.status === "active" &&
    firstEmailSent &&
    requestAckGen > 0 &&
    !customerAcknowledgedCurrentRequest(journey);

  const currentStep = journey.currentStep as RecycleJourneyWorkflowStep;
  const nextAction = !isTerminal
    ? (() => {
        if (requestDeclined && firstEmailSent) {
          return {
            ...SEND_REQUEST_EMAIL_ACTION,
            label: "Resend Recycle Request",
            description: "Customer declined — send a fresh confirmation email",
          };
        }
        if (pickupBlocked) return null;
        if (currentStep === "recycle-request" && !firstEmailSent) return SEND_REQUEST_EMAIL_ACTION;
        return NEXT_ACTION[currentStep] ?? null;
      })()
    : null;

  function doSend(extra?: Record<string, unknown>) {
    if (!nextAction) return;
    setSending(true);
    setForm(null);
    const isResend = requestDeclined && nextAction.nextStep === "recycle-request";
    const mut = isResend ? resendMutate : sendStep;
    mut(
      { id, step: nextAction.nextStep, payload: { dynamicData: extra ?? {} } },
      {
        onSuccess: () => { toast.success("Email queued"); onSuccess(); },
        onError: (e: unknown) => toast.error(extractMsg(e)),
        onSettled: () => setSending(false),
      },
    );
  }

  function handleFormConfirm(data: Record<string, string>) {
    if (!nextAction) return;
    updateData(
      { id, data },
      {
        onSuccess: () => doSend(data),
        onError: (e: unknown) => toast.error(extractMsg(e)),
      },
    );
  }

  function handleRequestFormConfirm(data: Record<string, unknown>) {
    if (!nextAction) return;
    updateData(
      { id, data },
      {
        onSuccess: () => doSend(data),
        onError: (e: unknown) => toast.error(extractMsg(e)),
      },
    );
  }

  function handlePrimaryClick() {
    if (!nextAction) return;
    if (nextAction.nextStep === "recycle-request") { setForm("request"); return; }
    if (nextAction.nextStep === "pickup-scheduled") { setForm("pickup"); return; }
    if (nextAction.nextStep === "devices-collected") { setForm("collected"); return; }
    if (nextAction.nextStep === "certificate-issued") { setForm("certificate"); return; }
    doSend();
  }

  return (
    <div className="space-y-4">
      {pickupBlocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-[11px] text-amber-900">
          Customer must confirm pickup in the Recycle Request email before you can schedule pickup.
        </div>
      )}

      {nextAction && !form && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div>
            <p className="text-[12px] font-bold">{nextAction.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{nextAction.description}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className={cn("h-8 flex-1 text-xs", nextAction.variant === "success" && "bg-teal-600 hover:bg-teal-700")}
              disabled={sending}
              onClick={handlePrimaryClick}
            >
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <nextAction.Icon className="size-3.5 mr-1" />}
              {nextAction.label}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => previewEmail(nextAction.nextStep)}>
              <Eye className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {form === "request" && (
        <RecycleRequestForm
          initial={(journey.dynamicData ?? {}) as Record<string, unknown>}
          onConfirm={handleRequestFormConfirm}
          onCancel={() => setForm(null)}
          onPreview={(d) => previewEmail("recycle-request", d)}
        />
      )}
      {form === "pickup" && (
        <PickupForm
          initial={journey.dynamicData}
          onConfirm={handleFormConfirm}
          onCancel={() => setForm(null)}
          onPreview={(d) => previewEmail("pickup-scheduled", d)}
        />
      )}
      {form === "collected" && (
        <CollectedForm initial={journey.dynamicData} onConfirm={handleFormConfirm} onCancel={() => setForm(null)} />
      )}
      {form === "certificate" && (
        <CertificateForm initial={journey.dynamicData} onConfirm={handleFormConfirm} onCancel={() => setForm(null)} />
      )}

      {journey.completedSteps.some((s) => RESEND_ALLOWED.has(s)) && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Resend email</p>
          <div className="space-y-1">
            {journey.completedSteps.filter((s) => RESEND_ALLOWED.has(s)).map((step) => (
              <button
                key={step}
                type="button"
                disabled={sending}
                onClick={() => {
                  setSending(true);
                  resendMutate(
                    { id, step, payload: {} },
                    {
                      onSuccess: () => { toast.success("Email resent"); onSuccess(); },
                      onError: (e: unknown) => toast.error(extractMsg(e)),
                      onSettled: () => setSending(false),
                    },
                  );
                }}
                className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/40"
              >
                {RecycleJourneyStepLabel(step)}
                <RotateCcw className="size-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {!isTerminal && (
        <div className="rounded-xl border border-border p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Danger zone</p>
          {!confirmingCancel ? (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/40"
            >
              <XCircle className="size-3.5" /> Cancel request
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs">Cancel this recycling journey?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => setConfirmingCancel(false)}>Keep</Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 flex-1 text-xs"
                  disabled={cancelling}
                  onClick={() => cancelMutate(id, { onSuccess: () => { toast.success("Cancelled"); onSuccess(); setConfirmingCancel(false); } })}
                >
                  {cancelling ? <Loader2 className="size-3 animate-spin" /> : "Cancel"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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

function ItemsSummary({ journey }: { journey: RecycleRequestJourney }) {
  const dd = (journey.dynamicData ?? {}) as Record<string, unknown>;
  const mode = String(dd.collectionMode ?? "listed");
  const modeLabel =
    RECYCLE_COLLECTION_MODE_OPTIONS.find((o) => o.value === mode)?.label ??
    mode.replace("_", " ");
  const items = Array.isArray(dd.recycleItems) ? (dd.recycleItems as RecycleItemLine[]) : [];
  const bulkCategories = Array.isArray(dd.bulkCategories)
    ? (dd.bulkCategories as RecycleBulkCategoryLine[])
    : [];
  const bulkEstimate = String(dd.bulkEstimate ?? "");
  const bulkEstimateLabel = RECYCLE_BULK_ESTIMATE_OPTIONS.find((o) => o.value === bulkEstimate)?.label;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Collection</p>
      <p className="text-[11px] text-muted-foreground">{modeLabel}</p>

      {mode === "listed" && items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-[12px] font-medium">
              {item.name} <span className="text-muted-foreground font-normal">× {formatRecycleQty(item.qty)}</span>
            </li>
          ))}
        </ul>
      ) : mode === "bulk_estimate" ? (
        <div className="space-y-1 text-[12px]">
          {bulkEstimateLabel ? (
            <p><span className="text-muted-foreground">Volume:</span> {bulkEstimateLabel}</p>
          ) : null}
          {bulkCategories.filter((c) => c.category.trim()).map((c, i) => (
            <p key={i}>
              {c.category} <span className="text-muted-foreground">× {formatRecycleQty(c.qty)}</span>
            </p>
          ))}
          {dd.bulkDescription ? (
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{String(dd.bulkDescription)}</p>
          ) : null}
        </div>
      ) : dd.recycleItemsSummary ? (
        <p className="text-[12px] font-medium">{String(dd.recycleItemsSummary)}</p>
      ) : null}

      {dd.pickupAddress ? (
        <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
          <span className="font-medium text-foreground/80">Pickup:</span> {String(dd.pickupAddress)}
        </p>
      ) : null}
      {dd.collectionNotes ? (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">Notes:</span> {String(dd.collectionNotes)}
        </p>
      ) : null}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecycleRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: journey, isLoading, refetch, isFetching } = useRecycleJourney(id ?? null);
  const [rightTab, setRightTab] = useState<"actions" | "notes">("actions");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewStepKey, setPreviewStepKey] = useState("");
  const [previewStepLoading, setPreviewStepLoading] = useState<string | null>(null);
  const previewRunRef = useRef(0);
  const { mutateAsync: loadPreview } = usePreviewJourneyEmail();

  const handleSuccess = useCallback(() => { void refetch(); }, [refetch]);

  const openEmailPreview = useCallback(async (step: string, extraDynamic?: Record<string, unknown>) => {
    if (!id) return;
    const run = ++previewRunRef.current;
    setPreviewStepLoading(step);
    try {
      const res = await loadPreview({
        id,
        step,
        payload: extraDynamic ? { dynamicData: extraDynamic } : {},
      });
      if (run !== previewRunRef.current) return;
      setPreviewSubject(res.subject);
      setPreviewHtml(res.html);
      setPreviewStepKey(res.stepKey ?? step);
      setPreviewOpen(true);
    } finally {
      if (run === previewRunRef.current) setPreviewStepLoading(null);
    }
  }, [id, loadPreview]);

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
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/recycle")}>
          <ArrowLeft className="mr-1.5 size-3.5" /> Back
        </Button>
      </div>
    );
  }

  const done = RECYCLE_JOURNEY_WORKFLOW_STEPS.filter((s) => journeyTimelineStepSent(journey, s)).length;
  const pct = Math.round((done / RECYCLE_JOURNEY_WORKFLOW_STEPS.length) * 100);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <div className="shrink-0 border-b border-border bg-card px-5 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <button type="button" onClick={() => router.push("/dashboard/recycle")} className="rounded-lg p-1.5 hover:bg-muted/60">
                <ArrowLeft className="size-4 text-muted-foreground" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[14px] font-bold truncate">#{journey.requestId}</h1>
                  <StatusBadge status={journey.status} />
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{journey.customerName} · {journey.customerEmail}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
                <Recycle className="size-3.5" />
                {done}/{RECYCLE_JOURNEY_WORKFLOW_STEPS.length} steps · {pct}%
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleSuccess()} disabled={isFetching}>
                <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-border overflow-y-auto p-4 space-y-4">
            <ItemsSummary journey={journey} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Created</p>
              <p className="text-[12px]">{formatDateTimeDDMMYY(journey.createdAt)}</p>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto border-r border-border p-4 space-y-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Journey timeline</p>
              {RECYCLE_JOURNEY_WORKFLOW_STEPS.map((step, idx) => (
                <TimelineStep
                  key={step}
                  stepKey={step}
                  idx={idx}
                  journey={journey}
                  onPreview={(sk) => { void openEmailPreview(sk); }}
                  previewLoading={previewStepLoading}
                />
              ))}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="size-3.5 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer activity</p>
              </div>
              <ActivityFeed journeyId={id} />
            </div>
          </div>

          <div className="flex w-[320px] shrink-0 flex-col overflow-hidden">
            <div className="flex shrink-0 border-b border-border">
              {(["actions", "notes"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRightTab(t)}
                  className={cn(
                    "flex-1 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider",
                    rightTab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground",
                  )}
                >
                  {t === "notes" ? <><StickyNote className="size-3 inline mr-1" />Notes</> : "Actions"}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {rightTab === "actions" ? (
                <ActionPanel journey={journey} id={id} onSuccess={handleSuccess} previewEmail={openEmailPreview} />
              ) : (
                <StaffNotesPanel journey={journey} onRefresh={handleSuccess} />
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent showCloseButton className={cn(SELL_EMAIL_PREVIEW_DIALOG_CLASS, "rounded-2xl")}>
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm font-semibold">Email preview</DialogTitle>
            {previewStepKey ? <p className="text-[11px]">{RecycleJourneyStepLabel(previewStepKey)}</p> : null}
            <p className="text-[11px] text-muted-foreground break-all">{previewSubject}</p>
          </DialogHeader>
          <div className="p-3">
            <div className={SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS}>
              <iframe title="Email preview" srcDoc={previewHtml} sandbox="allow-same-origin" className={SELL_EMAIL_PREVIEW_IFRAME_CLASS} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
