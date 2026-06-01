"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  Search,
  Loader2,
  Inbox,
  RefreshCw,
  ChevronRight,
  Send,
  KeyRound,
  Trash2,
  ArrowLeft,
  Package,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateDDMMYY, isoYmdToDisplay } from "@/lib/date-format";
import { toast } from "sonner";
import {
  useRentJourneys,
  useCreateRentJourney,
  useSendRentJourneyStep,
  useRentStats,
} from "@/hooks/use-rent-journeys";
import { ROUTES } from "@/constants/routes";
import {
  RENT_JOURNEY_WORKFLOW_STEPS,
  RENT_JOURNEY_STEP_LABELS,
  RENT_JOURNEY_CURRENCIES,
  type RentRequestJourney,
  type RentJourneyCurrency,
  type RentJourneyStatus,
  type RentItemLine,
} from "@/types/rent";
import { RENT_STATUS_CONFIG } from "@/modules/rent/constants";
import { rentService } from "@/services/rent.service";
import {
  SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS,
  SELL_EMAIL_PREVIEW_IFRAME_CLASS,
} from "@/constants/sell-email-preview";
import {
  getRentReturnDueInfo,
  rentReturnDueBadgeClass,
  rentReturnDueBadgeLabel,
  sortRentJourneysByReturnDueAsc,
} from "@/lib/rent-return-due";

const CURRENCY_FLAGS: Record<RentJourneyCurrency, string> = {
  AED: "🇦🇪",
  INR: "🇮🇳",
  USD: "🇺🇸",
  SAR: "🇸🇦",
};

type FilterTab = "all" | "active" | "completed" | "cancelled" | "return_due";

function ReturnDueCell({ journey }: { journey: RentRequestJourney }) {
  const due = getRentReturnDueInfo(journey);
  if (!due.iso) {
    return <span className="text-[11px] text-border">—</span>;
  }

  const badgeLabel = rentReturnDueBadgeLabel(due.status);
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-semibold tabular-nums text-foreground">{due.label}</p>
      {badgeLabel && due.awaitingReturn ? (
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            rentReturnDueBadgeClass(due.status),
          )}
        >
          {badgeLabel}
        </span>
      ) : due.status === "upcoming" ? (
        <span className="text-[10px] text-muted-foreground">Scheduled</span>
      ) : null}
    </div>
  );
}

function StatusChip({ status }: { status: RentJourneyStatus }) {
  const c = RENT_STATUS_CONFIG[status] ?? RENT_STATUS_CONFIG.active;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        c.cls,
      )}
    >
      {c.label}
    </span>
  );
}

function ProgressBar({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
}

// ── Pipeline strip ────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { key: "rent-request", short: "Request" },
  { key: "rent-agreement", short: "Agreement" },
  { key: "rent-ready-pickup", short: "Pickup" },
  { key: "rent-dispatched", short: "Dispatch" },
  { key: "rent-handover", short: "Handover" },
  { key: "rent-return-reminder", short: "Reminder" },
  { key: "rent-return-received", short: "Returned" },
] as const;

type PipelineStepKey = (typeof PIPELINE_STEPS)[number]["key"];

const PIPELINE_COLORS: Record<
  PipelineStepKey,
  { bg: string; text: string; ring: string; activeBg: string; activeText: string }
> = {
  "rent-request": {
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "ring-sky-200",
    activeBg: "bg-sky-500",
    activeText: "text-white",
  },
  "rent-agreement": {
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-200",
    activeBg: "bg-violet-500",
    activeText: "text-white",
  },
  "rent-ready-pickup": {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
    activeBg: "bg-indigo-500",
    activeText: "text-white",
  },
  "rent-dispatched": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    activeBg: "bg-amber-500",
    activeText: "text-white",
  },
  "rent-handover": {
    bg: "bg-orange-50",
    text: "text-orange-700",
    ring: "ring-orange-200",
    activeBg: "bg-orange-500",
    activeText: "text-white",
  },
  "rent-return-reminder": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    activeBg: "bg-emerald-500",
    activeText: "text-white",
  },
  "rent-return-received": {
    bg: "bg-teal-50",
    text: "text-teal-700",
    ring: "ring-teal-200",
    activeBg: "bg-teal-500",
    activeText: "text-white",
  },
};

function PipelineStrip({
  byCurrentStep,
  activeStep,
  onSelect,
  loading,
}: {
  byCurrentStep: Record<string, number>;
  activeStep: string | null;
  onSelect: (key: string | null) => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-0.5 scrollbar-none">
      {PIPELINE_STEPS.map((step, i) => {
        const col = PIPELINE_COLORS[step.key];
        const count = byCurrentStep[step.key] ?? 0;
        const active = activeStep === step.key;
        return (
          <div key={step.key} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onSelect(active ? null : step.key)}
              className={cn(
                "relative flex min-w-[76px] flex-col items-center justify-center rounded-xl px-3 py-2 ring-1 transition-all",
                active
                  ? `${col.activeBg} ${col.activeText} shadow-md ring-transparent`
                  : `${col.bg} ${col.text} ${col.ring} hover:shadow-sm hover:ring-2`,
                loading && active && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "text-[18px] font-extrabold tabular-nums leading-none",
                  active ? col.activeText : col.text,
                )}
              >
                {loading && active ? "…" : count}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-center text-[9.5px] font-semibold leading-tight tracking-wide",
                  active ? "opacity-90" : "opacity-75",
                )}
              >
                {step.short}
              </span>
            </button>
            {i < PIPELINE_STEPS.length - 1 && (
              <ArrowRight className="mx-1 size-3 shrink-0 text-border" />
            )}
          </div>
        );
      })}

      {activeStep && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="ml-2 shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
        >
          Clear ×
        </button>
      )}
    </div>
  );
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

interface TabDef {
  key: FilterTab;
  label: string;
  urgent?: boolean;
}

const TABS: TabDef[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "return_due", label: "Return Due", urgent: true },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function statusParamToTab(raw: string | null): FilterTab {
  if (raw === "return_due") return "return_due";
  if (raw === "active" || raw === "completed" || raw === "cancelled") return raw;
  return "all";
}

function tabFromSearchParams(sp: Pick<URLSearchParams, "get">): FilterTab {
  const legacy = sp.get("tab");
  if (legacy) return statusParamToTab(legacy);
  const st = sp.get("status");
  if (st) return statusParamToTab(st);
  return "all";
}

function buildRentListPath(tab: FilterTab): string {
  const sp = new URLSearchParams();
  if (tab !== "all") sp.set("status", tab);
  const q = sp.toString();
  return q ? `${ROUTES.RENT}?${q}` : ROUTES.RENT;
}

function formatItemsSummary(items: RentItemLine[] | undefined): string {
  if (!items?.length) return "";
  return items
    .map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`)
    .join(", ");
}

function RequestRow({
  journey,
  onClick,
}: {
  journey: RentRequestJourney;
  onClick: () => void;
}) {
  const done = journey.completedSteps.length;
  const total = RENT_JOURNEY_WORKFLOW_STEPS.length;
  const items = journey.dynamicData?.rentalItems as RentItemLine[] | undefined;
  const mode = journey.dynamicData?.fulfillmentMode as string | undefined;

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onClick={onClick}
      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30"
    >
      <td className="whitespace-nowrap py-3.5 pl-6 pr-3">
        <code className="font-mono text-[12px] font-bold text-foreground">
          {journey.requestId}
        </code>
      </td>
      <td className="px-3 py-3.5">
        <p className="text-[13px] font-semibold leading-tight text-foreground">
          {journey.customerName}
        </p>
        <p className="max-w-[180px] truncate text-[11px] text-muted-foreground">
          {journey.customerEmail}
        </p>
      </td>
      <td className="hidden px-3 py-3.5 md:table-cell">
        {formatItemsSummary(items) ? (
          <span className="text-[12px] text-muted-foreground">
            {formatItemsSummary(items)}
          </span>
        ) : (
          <span className="text-[11px] text-border">—</span>
        )}
      </td>
      <td className="hidden px-3 py-3.5 sm:table-cell">
        {mode ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
            {mode}
          </span>
        ) : (
          <span className="text-[10px] italic text-amber-600 dark:text-amber-400">
            Pending customer
          </span>
        )}
      </td>
      <td className="hidden px-3 py-3.5 md:table-cell">
        <ReturnDueCell journey={journey} />
      </td>
      <td className="hidden px-3 py-3.5 lg:table-cell">
        <ProgressBar done={done} total={total} />
      </td>
      <td className="whitespace-nowrap px-3 py-3.5">
        <StatusChip status={journey.status as RentJourneyStatus} />
      </td>
      <td className="hidden whitespace-nowrap px-3 py-3.5 xl:table-cell">
        <span className="text-[11px] text-muted-foreground">
          {formatDateDDMMYY(journey.createdAt)}
        </span>
      </td>
      <td className="py-3.5 pl-3 pr-5 text-right">
        <ChevronRight className="inline-block size-3.5 text-muted-foreground/50" />
      </td>
    </motion.tr>
  );
}

function emptyItemLine(): RentItemLine {
  return { name: "", qty: 1, rate: "" };
}

function buildDynamicDataFromItems(items: RentItemLine[]) {
  const validItems = items
    .filter((i) => i.name.trim())
    .map((i) => ({
      name: i.name.trim(),
      qty: Math.max(1, i.qty),
      rate: String(i.rate ?? "").trim(),
    }));
  const rentalItemsSummary = validItems.map((i) => `${i.name} ×${i.qty}`).join(", ");
  return { validItems, rentalItemsSummary };
}

function CreateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [items, setItems] = useState<RentItemLine[]>([emptyItemLine()]);
  const [requestDate, setRequestDate] = useState(() =>
    new Date().toISOString().split("T")[0],
  );
  const [currency, setCurrency] = useState<RentJourneyCurrency>("AED");
  const [phase, setPhase] = useState<"form" | "preview" | "creating">("form");
  const [draftPreviewHtml, setDraftPreviewHtml] = useState("");
  const [draftPreviewSubject, setDraftPreviewSubject] = useState("");
  const [draftPreviewLoading, setDraftPreviewLoading] = useState(false);

  const { mutate: createJourney } = useCreateRentJourney();
  const { mutate: sendStep } = useSendRentJourneyStep();

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setItems([emptyItemLine()]);
    setRequestDate(new Date().toISOString().split("T")[0]);
    setCurrency("AED");
    setPhase("form");
    setDraftPreviewHtml("");
    setDraftPreviewSubject("");
    setDraftPreviewLoading(false);
  }

  function buildDynamicData() {
    const { validItems, rentalItemsSummary } = buildDynamicDataFromItems(items);
    return {
      customerPhone: phone.trim() || undefined,
      customerAddress: address.trim() || undefined,
      rentalItems: validItems,
      rentalItemsSummary: rentalItemsSummary || undefined,
      requestDate: isoYmdToDisplay(requestDate) || requestDate,
    };
  }

  function validate(): boolean {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return false;
    }
    const validItems = items.filter((i) => i.name.trim());
    if (validItems.length === 0) {
      toast.error("Add at least one rental item");
      return false;
    }
    return true;
  }

  function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setPhase("preview");
  }

  useEffect(() => {
    if (phase !== "preview") return;
    let cancelled = false;
    setDraftPreviewLoading(true);
    setDraftPreviewHtml("");
    setDraftPreviewSubject("");
    rentService
      .previewJourneyDraft({
        step: "rent-request",
        customerName: name.trim(),
        currency,
        dynamicData: buildDynamicData(),
      })
      .then((r) => {
        if (!cancelled) {
          setDraftPreviewHtml(r.html);
          setDraftPreviewSubject(r.subject);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load email preview");
      })
      .finally(() => {
        if (!cancelled) setDraftPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, name, currency, phone, address, items, requestDate]);

  function handleCreateOnly(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault();
    if (!validate()) return;
    setPhase("creating");
    createJourney(
      {
        customerEmail: email.trim(),
        customerName: name.trim(),
        currency,
        dynamicData: buildDynamicData(),
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
        onError: () => setPhase("form"),
      },
    );
  }

  function handleCreateAndSend() {
    if (!validate()) return;
    setPhase("creating");
    createJourney(
      {
        customerEmail: email.trim(),
        customerName: name.trim(),
        currency,
        dynamicData: buildDynamicData(),
      },
      {
        onSuccess: (journey) => {
          const journeyId = journey?._id ?? journey?.id;
          if (!journeyId) {
            reset();
            onClose();
            return;
          }
          sendStep(
            { id: journeyId, step: "rent-request", payload: {} },
            {
              onSuccess: () => {
                toast.success("Rent request email sent");
                reset();
                onClose();
              },
              onError: () => {
                toast.info("Request created — open it to send the email manually");
                reset();
                onClose();
              },
            },
          );
        },
        onError: () => setPhase(phase === "preview" ? "preview" : "form"),
      },
    );
  }

  if (!open) return null;

  const canSubmit =
    Boolean(name.trim()) &&
    Boolean(email.trim()) &&
    items.some((i) => i.name.trim());

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={phase === "form" ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="fixed left-1/2 top-[3%] z-50 max-h-[94vh] w-full max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
      >
        {phase === "creating" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-card/95">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-[13px] font-semibold">Creating rent request…</p>
          </div>
        )}

        {phase === "preview" && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPhase("form")}
                className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Back to form
              </button>
            </div>
            <div>
              <h2 className="mb-0.5 text-[15px] font-bold text-foreground">Email Preview</h2>
              <p className="text-[11px] text-muted-foreground">
                Same template as the journey step — how the <strong>Rent Request</strong> email will look when sent.
              </p>
            </div>
            {draftPreviewLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border py-14">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-[11px] text-muted-foreground">Loading preview…</p>
              </div>
            ) : draftPreviewHtml ? (
              <div className={SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS}>
                {draftPreviewSubject ? (
                  <p className="mb-2 break-all px-1 text-[10px] font-medium text-muted-foreground">
                    {draftPreviewSubject}
                  </p>
                ) : null}
                <iframe
                  title="Email preview"
                  srcDoc={draftPreviewHtml}
                  sandbox="allow-same-origin"
                  className={SELL_EMAIL_PREVIEW_IFRAME_CLASS}
                />
              </div>
            ) : (
              <p className="text-center text-[11px] text-muted-foreground">Preview unavailable.</p>
            )}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPhase("form")}>
                <ArrowLeft className="mr-1 size-3.5" /> Back
              </Button>
              <Button type="button" className="flex-1 gap-1.5 bg-primary" onClick={handleCreateAndSend}>
                <Send className="size-3.5" /> Create &amp; Send Email
              </Button>
            </div>
          </div>
        )}

        {phase === "form" && (
        <div className="p-6">
          <h2 className="mb-1 text-[15px] font-bold text-foreground">New RENT Request</h2>
          <p className="mb-5 text-[11px] leading-relaxed text-muted-foreground">
            Fill in the request details. Preview the email design before sending, or create without sending.
            Customer chooses pickup or delivery when they confirm from the email.
          </p>

          <form onSubmit={handlePreview} className="space-y-4">
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Customer Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="h-9"
                    autoFocus
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Email Address *</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@email.com"
                    className="h-9"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Phone</label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+971 50 123 4567"
                    className="h-9"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Full address including landmark…"
                    rows={2}
                    className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring min-h-[72px]"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rental items</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => setItems([...items, emptyItemLine()])}
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
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_64px_32px] gap-2 items-center px-2.5 py-2">
                      <div className="relative min-w-0">
                        <Package className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setItems(next);
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
                          const next = [...items];
                          next[idx] = {
                            ...next[idx],
                            qty: Math.max(1, parseInt(e.target.value, 10) || 1),
                          };
                          setItems(next);
                        }}
                        className="h-9 w-full min-w-0 text-center tabular-nums"
                        aria-label="Qty"
                      />
                      <button
                        type="button"
                        disabled={items.length <= 1}
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="flex size-8 items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30"
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Request date &amp; currency</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Request Date</label>
                  <Input
                    type="date"
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold text-muted-foreground">Currency</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {RENT_JOURNEY_CURRENCIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={cn(
                        "rounded-lg border py-2 text-[12px] font-semibold transition-all",
                        currency === c
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {CURRENCY_FLAGS[c]} {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                disabled={!canSubmit}
                onClick={handleCreateOnly}
              >
                Create Only
              </Button>
              <Button type="submit" size="sm" className="flex-1 gap-1.5" disabled={!canSubmit}>
                Preview Email →
              </Button>
            </div>
          </form>
        </div>
        )}
      </motion.div>
    </>
  );
}

export default function RentRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>(() => tabFromSearchParams(searchParams));
  const [creating, setCreating] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } =
    useRentStats();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setTab(tabFromSearchParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    setPipelineStep(null);
  }, [tab]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch, pipelineStep]);

  const isReturnDueTab = tab === "return_due";
  const activeStatus =
    tab === "all" || isReturnDueTab || pipelineStep ? undefined : tab;

  const { data, isLoading, refetch, isFetching } = useRentJourneys({
    search: debouncedSearch || undefined,
    status: pipelineStep ? "active" : activeStatus,
    currentStep: pipelineStep ?? undefined,
    returnDue: isReturnDueTab ? true : undefined,
    page,
    limit: PAGE_SIZE,
  });

  const journeys: RentRequestJourney[] = useMemo(() => {
    const rows = data?.data ?? [];
    return isReturnDueTab ? sortRentJourneysByReturnDueAsc(rows) : rows;
  }, [data?.data, isReturnDueTab]);
  const listTotal = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;
  const hasMore = page < totalPages;

  const badgeCounts = useMemo(() => {
    const bs = statsData?.byStatus;
    return {
      all: statsData?.total ?? 0,
      active: bs?.active ?? 0,
      return_due:
        statsData?.returnAwaitingCount ?? statsData?.returnDueFollowUpCount ?? 0,
      completed: bs?.completed ?? 0,
      cancelled: bs?.cancelled ?? 0,
    } satisfies Record<FilterTab, number>;
  }, [statsData]);

  function refreshAll() {
    void refetch();
    void refetchStats();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[15px] font-bold text-foreground">
              RENT Requests
            </h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Manage customer rental journeys — pickup or delivery
              {isReturnDueTab ? " · sorted by days left (fewest first)" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={ROUTES.RENT_OVERVIEW}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium text-muted-foreground transition-colors",
                "hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <KeyRound className="size-3.5" />
              Overview
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => refreshAll()}
              disabled={isFetching || statsLoading}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  (isFetching || statsLoading) && "animate-spin",
                )}
              />
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-3.5" /> New Request
            </Button>
          </div>
        </div>

        <div className="mt-3.5">
          <PipelineStrip
            byCurrentStep={statsData?.byCurrentStep ?? {}}
            activeStep={pipelineStep}
            onSelect={(k) => {
              setPipelineStep(k);
              setPage(1);
            }}
            loading={isFetching && !!pipelineStep}
          />
        </div>

        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="relative w-full max-w-xs sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search by name, email, request ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div
            className="inline-flex flex-wrap items-center gap-0.5 rounded-xl border border-border/80 bg-muted/40 p-1 shadow-inner dark:bg-muted/25"
            role="tablist"
            aria-label="Filter journeys by status"
          >
            {TABS.map(({ key, label, urgent }) => {
              const href = buildRentListPath(key);
              const selected = tab === key;
              const n = badgeCounts[key];
              const hasUrgent = urgent && n > 0;
              return (
                <Link
                  key={key}
                  href={href}
                  scroll={false}
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    "inline-flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-all outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? hasUrgent
                        ? "bg-amber-50 text-amber-800 shadow-sm ring-1 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-700"
                        : "bg-background text-foreground shadow-sm ring-1 ring-border/90 dark:ring-border"
                      : hasUrgent
                        ? "text-amber-600 hover:bg-amber-50/60 dark:text-amber-400"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                  )}
                >
                  {hasUrgent && (
                    <span className="relative mr-1.5 flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                    </span>
                  )}
                  {label}
                  {statsLoading ? (
                    <span
                      className="ml-1.5 inline-block size-4 animate-pulse rounded-full bg-muted-foreground/20"
                      aria-hidden
                    />
                  ) : (
                    <span
                      className={cn(
                        "ml-1.5 min-w-[1.25rem] rounded-full px-1.5 py-px text-center text-[9px] font-bold tabular-nums",
                        selected && hasUrgent
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                          : !selected && hasUrgent
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : selected
                              ? "bg-primary/15 text-primary dark:text-primary"
                              : "bg-muted/90 text-muted-foreground dark:bg-muted",
                        n === 0 && "opacity-60",
                      )}
                    >
                      {n}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {search.trim() || pipelineStep ? (
          <p className="mt-2 pl-0.5 text-[10px] text-muted-foreground">
            {search.trim() ? (
              <>
                Search narrows the table. Tab and pipeline counts stay
                workspace-wide (same source as Overview).
              </>
            ) : (
              <>
                Pipeline filter shows active journeys at that step. Tab counts
                stay workspace-wide.
              </>
            )}
          </p>
        ) : (
          <p className="mt-2 pl-0.5 text-[10px] text-muted-foreground">
            Tab counts match Overview. Pipeline shows how many active journeys
            are at each step. Table loads {PAGE_SIZE} rows per page.
          </p>
        )}
      </div>

      {pipelineStep && (
        <div className="shrink-0 border-b border-border bg-muted/20 px-6 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Filtered view: </span>
              Active journeys at{" "}
              <strong>
                {RENT_JOURNEY_STEP_LABELS[
                  pipelineStep as keyof typeof RENT_JOURNEY_STEP_LABELS
                ] ?? pipelineStep}
              </strong>
              .
            </p>
            <button
              type="button"
              className="text-[11px] font-semibold text-primary hover:underline"
              onClick={() => setPipelineStep(null)}
            >
              Clear filter
            </button>
          </div>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border"
        data-dashboard-primary-scroll=""
      >
        {isLoading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-4 border-b border-border/50 px-6 py-3.5"
              >
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="h-3 w-36 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="ml-auto h-3 w-16 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : journeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-32 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Inbox className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                {search.trim() || pipelineStep
                  ? "No results found"
                  : isReturnDueTab
                    ? "No returns due for follow-up"
                    : "No rent requests yet"}
              </p>
              <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">
                {search.trim()
                  ? `No requests match "${search.trim()}"`
                  : pipelineStep
                    ? "No active journeys at this step. Try another stage or clear the filter."
                    : isReturnDueTab
                      ? "Items show here after handover when a return due date is set."
                      : "Create your first rent request to start a customer rental journey."}
              </p>
            </div>
            {!search.trim() && !pipelineStep && (
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setCreating(true)}
              >
                <Plus className="size-3.5" /> Create First Request
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 border-b border-border bg-card">
              <tr>
                {[
                  { h: "Request ID", cls: "pl-6" },
                  { h: "Customer", cls: "" },
                  { h: "Items", cls: "hidden md:table-cell" },
                  { h: "Mode", cls: "hidden sm:table-cell" },
                  { h: "Return due", cls: "hidden md:table-cell" },
                  { h: "Progress", cls: "hidden lg:table-cell" },
                  { h: "Status", cls: "" },
                  { h: "Created", cls: "hidden xl:table-cell" },
                  { h: "", cls: "pr-5" },
                ].map(({ h, cls }) => (
                  <th
                    key={h}
                    className={cn(
                      "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                      cls,
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {journeys.map((j) => (
                  <RequestRow
                    key={j._id}
                    journey={j}
                    onClick={() => router.push(ROUTES.RENT_DETAIL(j._id))}
                  />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {hasMore && !isLoading && (
        <div className="flex justify-center border-t border-border/50 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            {isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            Load more
          </Button>
        </div>
      )}

      {journeys.length > 0 && !isLoading && (
        <div className="flex shrink-0 items-center justify-between border-t border-border/50 px-6 py-2">
          <p className="text-[10px] text-muted-foreground">
            Showing {journeys.length} of {listTotal} · Page {page} of{" "}
            {totalPages}
          </p>
          <button
            type="button"
            className="text-[10px] text-muted-foreground transition-colors hover:text-primary"
            onClick={() => router.push(ROUTES.RENT_DESIGN)}
          >
            Email Design →
          </button>
        </div>
      )}

      <AnimatePresence>
        {creating && (
          <CreateModal open={creating} onClose={() => setCreating(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
