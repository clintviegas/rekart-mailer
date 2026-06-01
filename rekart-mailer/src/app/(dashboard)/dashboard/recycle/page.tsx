"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Search, Loader2, Package, Inbox,
  Send, RefreshCw, ChevronRight, ArrowLeft, LayoutDashboard,
  Circle, CheckCircle2, XCircle, TrendingDown, Paperclip, X as XIcon, Download,
  ArrowRight, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateDDMMYY, isoYmdToDisplay } from "@/lib/date-format";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import {
  useRecycleJourneys,
  useCreateRecycleJourney,
  useSendNextRecycleStep,
  useSendRecycleJourneyStep,
  useRecycleStats,
} from "@/hooks/use-recycle-journeys";
import { ROUTES } from "@/constants/routes";
import { recycleService } from "@/services/recycle.service";
import {
  RECYCLE_JOURNEY_WORKFLOW_STEPS,
  RECYCLE_JOURNEY_STEP_LABELS,
  JOURNEY_CURRENCIES,
  type RecycleRequestJourney,
  type JourneyCurrency,
  type JourneyStatus,
} from "@/types/recycle";
import {
  SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS as RECYCLE_EMAIL_PREVIEW_FRAME_WRAP_CLASS,
  SELL_EMAIL_PREVIEW_IFRAME_CLASS as RECYCLE_EMAIL_PREVIEW_IFRAME_CLASS,
} from "@/constants/sell-email-preview";
import {
  buildRecycleDynamicDataFromForm,
  type RecycleBulkCategoryLine,
  type RecycleCollectionMode,
  type RecycleItemLine,
  RECYCLE_ASSET_CATEGORIES,
  RECYCLE_BULK_ESTIMATE_OPTIONS,
  type RecycleBulkEstimateBand,
} from "@/modules/recycle/recycle-items";
import { RECYCLE_COLLECTION_MODE_OPTIONS } from "@/modules/recycle/constants";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<JourneyCurrency, string> = {
  AED: "AED", INR: "₹", USD: "$", SAR: "SAR",
};

const CURRENCY_FLAGS: Record<JourneyCurrency, string> = {
  AED: "🇦🇪", INR: "🇮🇳", USD: "🇺🇸", SAR: "🇸🇦",
};

type FilterTab =
  | "all"
  | "active"
  | "completed"
  | "cancelled"
  | "request_declined"
  | "no_customer_action"
  | "reminder_due";

// ── Step progress dots ─────────────────────────────────────────────────────────

function ProgressBar({ done, total, status }: { done: number; total: number; status: string }) {
  const pct = Math.round((done / total) * 100);
  const color =
    status === "completed"     ? "bg-emerald-500" :
    status === "cancelled"     ? "bg-slate-400" :
    status === "quote_declined" || status === "booking_declined" || status === "no_customer_action"
      ? "bg-red-400"
    :
    "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 rounded-full bg-border overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{done}/{total}</span>
    </div>
  );
}

// ── Status chip ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  active:        { label: "Active",         cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-800",                 Icon: Circle },
  completed:     { label: "Device Returned",      cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800", Icon: CheckCircle2 },
  cancelled:     { label: "Cancelled",      cls: "text-slate-500 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800/40 dark:border-slate-700",           Icon: XCircle },
  quote_declined:{ label: "Quote Declined", cls: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800",                       Icon: TrendingDown },
  booking_declined: { label: "Booking Declined", cls: "text-orange-800 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950/40 dark:border-orange-800", Icon: TrendingDown },
  no_customer_action: { label: "No Response", cls: "text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800/40 dark:border-slate-700", Icon: Clock },
};

function StatusChip({ status }: { status: JourneyStatus }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", c.cls)}>
      <c.Icon className="size-2.5" />
      {c.label}
    </span>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

interface UploadedFile {
  storedFilename: string;
  originalName:   string;
  mimeType:       string;
  size:           number;
  url:            string;
}

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName]                   = useState("");
  const [email, setEmail]                 = useState("");
  const [collectionMode, setCollectionMode] = useState<RecycleCollectionMode>("listed");
  const [items, setItems]                 = useState<RecycleItemLine[]>([{ name: "", qty: 1 }]);
  const [bulkEstimate, setBulkEstimate]   = useState<string>("unknown");
  const [bulkDescription, setBulkDescription] = useState("");
  const [bulkCategories, setBulkCategories] = useState<RecycleBulkCategoryLine[]>([
    { category: RECYCLE_ASSET_CATEGORIES[0], qty: "unknown" },
  ]);
  const [pickupAddress, setPickupAddress] = useState("");
  const [collectionNotes, setCollectionNotes] = useState("");
  const [requestDate, setRequestDate]     = useState(() => new Date().toISOString().split("T")[0]);
  const [currency, setCurrency]           = useState<JourneyCurrency>("AED");
  const [phase, setPhase]                 = useState<"form" | "preview" | "creating">("form");
  const [attachments, setAttachments]     = useState<UploadedFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [createdId, setCreatedId]         = useState<string | null>(null);
  const [draftPreviewHtml, setDraftPreviewHtml]     = useState("");
  const [draftPreviewSubject, setDraftPreviewSubject] = useState("");
  const [draftPreviewLoading, setDraftPreviewLoading] = useState(false);

  const { mutate: createJourney }       = useCreateRecycleJourney();
  const { mutate: sendNext }            = useSendNextRecycleStep();
  const { mutate: sendJourneyStep }     = useSendRecycleJourneyStep();

  function reset() {
    setName(""); setEmail("");
    setCollectionMode("listed");
    setItems([{ name: "", qty: 1 }]);
    setBulkEstimate("unknown");
    setBulkDescription("");
    setBulkCategories([{ category: RECYCLE_ASSET_CATEGORIES[0], qty: "unknown" }]);
    setPickupAddress(""); setCollectionNotes("");
    setRequestDate(new Date().toISOString().split("T")[0]);
    setCurrency("AED"); setPhase("form"); setAttachments([]); setCreatedId(null);
    setDraftPreviewHtml(""); setDraftPreviewSubject(""); setDraftPreviewLoading(false);
  }

  function buildDynamicData() {
    const base = buildRecycleDynamicDataFromForm({
      collectionMode,
      recycleItems: items,
      bulkEstimate: bulkEstimate as RecycleBulkEstimateBand,
      bulkDescription,
      bulkCategories,
      pickupAddress,
      collectionNotes,
    });
    if (requestDate) base.requestDate = isoYmdToDisplay(requestDate) || requestDate;
    return base;
  }

  function validateForm(): boolean {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return false;
    }
    if (collectionMode === "listed") {
      const valid = items.some((i) => i.name.trim());
      if (!valid) {
        toast.error("Add at least one item with a name");
        return false;
      }
    } else if (!bulkDescription.trim() && !bulkCategories.some((c) => c.category.trim())) {
      toast.error("Describe the bulk collection or pick asset categories");
      return false;
    }
    return true;
  }

  const buildDynamicDataRef = useRef(buildDynamicData);
  buildDynamicDataRef.current = buildDynamicData;

  useEffect(() => {
    if (phase !== "preview") return;
    let cancelled = false;
    setDraftPreviewLoading(true);
    setDraftPreviewHtml("");
    setDraftPreviewSubject("");
    const dd = buildDynamicDataRef.current();
    recycleService
      .previewJourneyDraft({
        step: "recycle-request",
        customerName: name.trim(),
        currency,
        dynamicData: dd,
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
  }, [phase, name, currency, collectionMode, items, bulkEstimate, bulkDescription, bulkCategories, pickupAddress, collectionNotes, requestDate]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));
      const res = await apiClient.post<{ data: { accepted: UploadedFile[]; rejected: string[] } }>(
        "/recycle/attachments/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }
      );
      const { accepted, rejected } = res.data.data;
      if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
      if (rejected.length) toast.warning(`${rejected.length} file(s) rejected: ${rejected[0]}`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingFiles(false);
      e.target.value = "";
    }
  }

  /** Validate form and go to preview screen */
  function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    setPhase("preview");
  }

  /** Just create the journey — no email sent */
  function handleCreateOnly(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    setPhase("creating");
    createJourney(
      { customerEmail: email, customerName: name, currency, dynamicData: buildDynamicData(), attachments: attachments.length ? attachments : undefined },
      {
        onSuccess: () => { toast.success("Request created — go to detail page to send the first email"); reset(); onClose(); },
        onError:   () => setPhase("form"),
      },
    );
  }

  /** From preview: create journey then immediately send Booking Confirmed email */
  function handleCreateAndSend() {
    setPhase("creating");
    createJourney(
      { customerEmail: email, customerName: name, currency, dynamicData: buildDynamicData(), attachments: attachments.length ? attachments : undefined },
      {
        onSuccess: (newJourney: any) => {
          const journeyId = newJourney?._id ?? newJourney?.id;
          if (!journeyId) { toast.success("Request created"); reset(); onClose(); return; }
          sendJourneyStep(
            { id: journeyId, step: "recycle-request", payload: {} },
            {
              onSuccess: () => { toast.success("Request created — Recycle Request email sent! ✓"); reset(); onClose(); },
              onError:   () => { toast.info("Request created. Open it to send the first email manually."); reset(); onClose(); },
            },
          );
        },
        onError: () => setPhase("preview"),
      },
    );
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={phase === "form" ? onClose : undefined} />
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="fixed left-1/2 top-[3%] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-border bg-card shadow-2xl max-h-[94vh] overflow-y-auto"
      >
        {phase === "creating" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-card/95">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-[13px] font-semibold">Creating request…</p>
            <p className="text-[11px] text-muted-foreground">Please wait</p>
          </div>
        )}

        {/* ── PREVIEW PHASE ──────────────────────────────────────────────── */}
        {phase === "preview" && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPhase("form")}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="size-3.5" /> Back to form
              </button>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-foreground mb-0.5">Email Preview</h2>
              <p className="text-[11px] text-muted-foreground">
                Same template as the journey step preview — how the <strong>Recycle Request</strong> email will look when sent.
              </p>
            </div>
            {draftPreviewLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border py-14">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-[11px] text-muted-foreground">Loading preview…</p>
              </div>
            ) : draftPreviewHtml ? (
              <div className={RECYCLE_EMAIL_PREVIEW_FRAME_WRAP_CLASS}>
                {draftPreviewSubject ? (
                  <p className="mb-2 break-all px-1 text-[10px] font-medium text-muted-foreground">
                    {draftPreviewSubject}
                  </p>
                ) : null}
                <iframe
                  title="Email preview"
                  srcDoc={draftPreviewHtml}
                  sandbox="allow-same-origin"
                  className={RECYCLE_EMAIL_PREVIEW_IFRAME_CLASS}
                />
              </div>
            ) : (
              <p className="text-center text-[11px] text-muted-foreground">Preview unavailable.</p>
            )}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPhase("form")}>
                <ArrowLeft className="size-3.5 mr-1" /> Back
              </Button>
              <Button type="button" className="flex-1 gap-1.5 bg-primary" onClick={handleCreateAndSend}>
                <Send className="size-3.5" /> Create &amp; Send Email
              </Button>
            </div>
          </div>
        )}
        

        {phase !== "preview" && (
        <div className="p-6">
          <h2 className="text-[15px] font-bold text-foreground mb-1">New Recycle Request</h2>
          <p className="text-[11px] text-muted-foreground mb-5 leading-relaxed">
            Fill in the request details. Preview the email design before sending, or create without sending.
          </p>

          <form onSubmit={handlePreview} className="space-y-4">

            {/* ── Customer Info ─────────────────────────────── */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Customer Name *</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="h-9" autoFocus />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Email Address *</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@email.com" className="h-9" />
                </div>
              </div>
            </div>

            {/* ── Collection details ───────────────────────── */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">What to collect</p>
              <div className="grid grid-cols-2 gap-2">
                {RECYCLE_COLLECTION_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCollectionMode(opt.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-[11px] font-medium transition-all",
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
                    <div key={idx} className="grid grid-cols-[1fr_88px_32px] gap-2">
                      <Input
                        value={item.name}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row)),
                          )
                        }
                        placeholder="Item name — MacBook Pro, Monitor…"
                        className="h-9"
                      />
                      <Input
                        value={item.qty === "unknown" ? "" : String(item.qty)}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const qty = raw === "" ? "unknown" : Math.max(1, Number(raw) || 1);
                          setItems((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, qty } : row)),
                          );
                        }}
                        placeholder="Qty"
                        className="h-9"
                      />
                      <button
                        type="button"
                        disabled={items.length <= 1}
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="flex h-9 items-center justify-center rounded-md border border-border text-muted-foreground disabled:opacity-30"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px]"
                    onClick={() => setItems((prev) => [...prev, { name: "", qty: 1 }])}
                  >
                    + Add item
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Estimated volume</label>
                    <select
                      value={bulkEstimate}
                      onChange={(e) => setBulkEstimate(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                    >
                      {RECYCLE_BULK_ESTIMATE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {bulkCategories.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_88px] gap-2">
                        <select
                          value={row.category}
                          onChange={(e) =>
                            setBulkCategories((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, category: e.target.value } : r)),
                            )
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-[12px]"
                        >
                          {RECYCLE_ASSET_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <Input
                          value={row.qty === "unknown" ? "" : String(row.qty)}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            const qty = raw === "" ? "unknown" : Math.max(1, Number(raw) || 1);
                            setBulkCategories((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, qty } : r)),
                            );
                          }}
                          placeholder="Qty / blank"
                          className="h-9"
                        />
                      </div>
                    ))}
                  </div>
                  <textarea
                    value={bulkDescription}
                    onChange={(e) => setBulkDescription(e.target.value)}
                    placeholder="Office clearance — floor 3 IT room, mix of laptops, desktops, monitors. Exact count unknown."
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[72px]"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Pickup address</label>
                <Input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="Building, area, city" className="h-9" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Notes for collection team</label>
                <Input value={collectionNotes} onChange={(e) => setCollectionNotes(e.target.value)} placeholder="Reception desk, loading bay, access code…" className="h-9" />
              </div>
            </div>

            {/* ── Request meta ────────────────────────────── */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Request</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Request date</label>
                  <Input
                    type="date"
                    value={requestDate} onChange={(e) => setRequestDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Currency */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold text-muted-foreground">Currency</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {JOURNEY_CURRENCIES.map((c) => (
                    <button key={c} type="button" onClick={() => setCurrency(c)}
                      className={cn("rounded-lg border py-2 text-[12px] font-semibold transition-all",
                        currency === c ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                      )}>
                      {CURRENCY_FLAGS[c]} {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Attachments ───────────────────────────────── */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Attachments <span className="font-normal opacity-60">(PDF, DOC, JPG, PNG, WEBP)</span>
              </p>
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map((f) => (
                    <div key={f.storedFilename} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                      <span className="text-[13px]">{f.mimeType.includes("image") ? "🖼️" : f.mimeType.includes("pdf") ? "📄" : "📎"}</span>
                      <span className="flex-1 min-w-0 truncate text-[11px] text-foreground">{f.originalName}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{Math.round(f.size / 1024)}KB</span>
                      <button type="button" onClick={() => setAttachments((prev) => prev.filter((a) => a.storedFilename !== f.storedFilename))}
                        className="shrink-0 text-muted-foreground hover:text-destructive">
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30",
                uploadingFiles && "opacity-50 pointer-events-none",
              )}>
                {uploadingFiles ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
                {uploadingFiles ? "Uploading…" : "Attach files"}
                <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />
              </label>
            </div>

            {/* Bottom buttons */}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button type="button" size="sm" variant="outline" className="flex-1 gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                disabled={uploadingFiles} onClick={handleCreateOnly}>
                Create Only
              </Button>
              <Button type="submit" size="sm" className="flex-1 gap-1.5" disabled={uploadingFiles}>
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

// ── Table row ─────────────────────────────────────────────────────────────────

function RequestRow({ journey, onClick }: { journey: RecycleRequestJourney; onClick: () => void }) {
  const done  = journey.completedSteps.length;
  const total = RECYCLE_JOURNEY_WORKFLOW_STEPS.length;
  const nextLabel = !["completed", "cancelled", "request_declined", "no_customer_action"].includes(journey.status)
    ? RECYCLE_JOURNEY_STEP_LABELS[journey.currentStep as keyof typeof RECYCLE_JOURNEY_STEP_LABELS]
    : null;

  const itemsSummary = String(journey.dynamicData?.recycleItemsSummary ?? "");

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onClick={onClick}
      className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
    >
      {/* Request ID */}
      <td className="py-3.5 pl-6 pr-3 whitespace-nowrap">
        <code className="font-mono text-[12px] font-bold text-foreground">{journey.requestId}</code>
      </td>

      {/* Customer */}
      <td className="px-3 py-3.5">
        <p className="text-[13px] font-semibold text-foreground leading-tight">{journey.customerName}</p>
        <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{journey.customerEmail}</p>
      </td>

      {/* Items */}
      <td className="hidden px-3 py-3.5 md:table-cell">
        {itemsSummary ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground max-w-[220px] truncate">
            <Package className="size-3.5 shrink-0" />
            {itemsSummary}
          </span>
        ) : (
          <span className="text-[11px] text-border">—</span>
        )}
      </td>

      {/* Mode */}
      <td className="hidden px-3 py-3.5 sm:table-cell whitespace-nowrap">
        <span className="text-[11px] font-medium text-muted-foreground capitalize">
          {String(journey.dynamicData?.collectionMode ?? "listed").replace("_", " ")}
        </span>
      </td>

      {/* Progress */}
      <td className="hidden px-3 py-3.5 lg:table-cell">
        <ProgressBar done={done} total={total} status={journey.status} />
        {nextLabel && (
          <p className="mt-1 text-[10px] text-muted-foreground">{nextLabel}</p>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-1">
          <StatusChip status={journey.status as JourneyStatus} />
          {Boolean(journey.dynamicData?.reminderDue) && !journey.dynamicData?.requestAckByCustomer && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 ring-1 ring-amber-400/30">
              Reminder due
            </span>
          )}
          {journey.quoteExpiresAt && journey.status === "active" &&
            new Date(journey.quoteExpiresAt) > new Date() && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 ring-1 ring-blue-400/30">
              Expires {formatRelativeExpiry(journey.quoteExpiresAt)}
            </span>
          )}
        </div>
      </td>

      {/* Date */}
      <td className="hidden px-3 py-3.5 xl:table-cell whitespace-nowrap">
        <span className="text-[11px] text-muted-foreground">
          {formatDateDDMMYY(journey.createdAt)}
        </span>
      </td>

      {/* Open arrow */}
      <td className="py-3.5 pl-3 pr-5 text-right">
        <ChevronRight className="size-3.5 text-muted-foreground/50 inline-block" />
      </td>
    </motion.tr>
  );
}

// ── Pipeline strip ────────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { key: "recycle-request", label: "Recycle\u00a0Request", short: "Request" },
  { key: "pickup-scheduled", label: "Pickup\u00a0Scheduled", short: "Pickup" },
  { key: "devices-collected", label: "Devices\u00a0Collected", short: "Collected" },
  { key: "certificate-issued", label: "Certificate\u00a0Issued", short: "Done" },
] as const;

type PipelineStepKey = (typeof PIPELINE_STEPS)[number]["key"];

const PIPELINE_COLORS: Record<PipelineStepKey, { bg: string; text: string; ring: string; activeBg: string; activeText: string }> = {
  "recycle-request":    { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", activeBg: "bg-emerald-500", activeText: "text-white" },
  "pickup-scheduled":   { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200", activeBg: "bg-violet-500", activeText: "text-white" },
  "devices-collected":  { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200", activeBg: "bg-indigo-500", activeText: "text-white" },
  "certificate-issued": { bg: "bg-teal-50",   text: "text-teal-700",   ring: "ring-teal-200",   activeBg: "bg-teal-500",   activeText: "text-white" },
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
        const col   = PIPELINE_COLORS[step.key as PipelineStepKey];
        const count = byCurrentStep[step.key] ?? 0;
        const active = activeStep === step.key;
        return (
          <div key={step.key} className="flex items-center shrink-0">
            <button
              onClick={() => onSelect(active ? null : step.key)}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-xl px-3 py-2 transition-all ring-1 min-w-[76px]",
                active
                  ? `${col.activeBg} ${col.activeText} ring-transparent shadow-md`
                  : `${col.bg} ${col.text} ${col.ring} hover:shadow-sm hover:ring-2`,
                loading && active && "opacity-70",
              )}
            >
              <span className={cn(
                "text-[18px] font-extrabold tabular-nums leading-none",
                active ? col.activeText : col.text,
              )}>
                {loading && active ? "…" : count}
              </span>
              <span className={cn(
                "mt-0.5 text-[9.5px] font-semibold tracking-wide text-center leading-tight",
                active ? "opacity-90" : "opacity-75",
              )}>
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
          onClick={() => onSelect(null)}
          className="ml-2 shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border hover:text-foreground transition-colors"
        >
          Clear ×
        </button>
      )}
    </div>
  );
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

interface TabDef { key: FilterTab; label: string; urgent?: boolean; }
const TABS: TabDef[] = [
  { key: "all",             label: "All" },
  { key: "active",          label: "Active" },
  { key: "completed",       label: "Certificate Issued" },
  { key: "reminder_due",    label: "Reminder Due", urgent: true },
  { key: "request_declined", label: "Request ↓" },
  { key: "no_customer_action", label: "No Response" },
  { key: "cancelled",       label: "Cancelled" },
];

function statusParamToTab(raw: string | null): FilterTab {
  if (raw === "reminder_due") return "reminder_due";
  if (
    raw === "active" ||
    raw === "completed" ||
    raw === "cancelled" ||
    raw === "request_declined" ||
    raw === "no_customer_action"
  ) {
    return raw;
  }
  // Legacy repair-style tabs → recycle equivalents
  if (raw === "booking_declined" || raw === "quote_declined") return "request_declined";
  return "all";
}

function tabFromSearchParams(sp: Pick<URLSearchParams, "get">): FilterTab {
  const st = sp.get("status");
  if (st) return statusParamToTab(st);
  return "all";
}

/** Build /dashboard/recycle query preserving optional funnel drill-down */
function buildRecycleListPath(
  tab: FilterTab,
  insight: { completedStep: string | null },
): string {
  const sp = new URLSearchParams();
  if (tab !== "all") sp.set("status", tab);
  if (tab !== "reminder_due" && insight.completedStep) {
    sp.set("completedStep", insight.completedStep);
  }
  const q = sp.toString();
  return q ? `/dashboard/recycle?${q}` : "/dashboard/recycle";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecycleRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch]     = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Debounce: wait 300ms after the user stops typing before triggering a refetch
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [tab, setTab]           = useState<FilterTab>(() =>
    tabFromSearchParams(searchParams),
  );
  const [creating, setCreating] = useState(false);

  const completedStepParam   = searchParams.get("completedStep")?.trim() || null;
  const hasInsightFilter = !!completedStepParam;

  useEffect(() => {
    setTab(tabFromSearchParams(searchParams));
  }, [searchParams]);

  const clearInsightFilters = useCallback(() => {
    router.replace(
      buildRecycleListPath(tab, { completedStep: null }),
      { scroll: false },
    );
  }, [router, tab]);

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useRecycleStats();

  const isReminderTab  = tab === "reminder_due";

  const [pipelineStep, setPipelineStep] = useState<string | null>(null);

  // Reset pipeline step when tab changes
  useEffect(() => { setPipelineStep(null); }, [tab]);

  const [exportLoading, setExportLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Reset to page 1 whenever filters/tab/search changes
  useEffect(() => { setPage(1); }, [tab, debouncedSearch, completedStepParam, pipelineStep]);

  const activeStatus =
    tab === "all" || isReminderTab ? undefined : tab;

  const { data, isLoading, refetch, isFetching } = useRecycleJourneys({
    search: debouncedSearch || undefined,
    status: pipelineStep ? "active" : activeStatus,
    completedStep: isReminderTab || pipelineStep ? undefined : (completedStepParam ?? undefined),
    reminderDue: isReminderTab ? true : undefined,
    currentStep: pipelineStep ?? undefined,
    page,
    limit: PAGE_SIZE,
  });

  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      await recycleService.exportJourneysCsv({
        status: activeStatus,
        search: debouncedSearch || undefined,
      });
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExportLoading(false);
    }
  }, [activeStatus, debouncedSearch]);

  const journeys: RecycleRequestJourney[] = data?.data ?? [];
  const listTotal    = data?.meta?.total ?? 0;
  const totalPages   = data?.meta?.totalPages ?? 1;
  const hasMore      = page < totalPages;

  /** Workspace-wide counts (matches Overview) — not the current filtered page slice */
  const badgeCounts = useMemo(() => {
    const bs = statsData?.byStatus;
    return {
      all: statsData?.total ?? 0,
      active: bs?.active ?? 0,
      completed: bs?.completed ?? 0,
      request_declined: bs?.request_declined ?? bs?.booking_declined ?? bs?.quote_declined ?? 0,
      no_customer_action: bs?.no_customer_action ?? 0,
      cancelled: bs?.cancelled ?? 0,
      reminder_due: statsData?.reminderDueCount ?? 0,
    } satisfies Record<FilterTab, number>;
  }, [statsData]);

  const insightForTabs = useMemo(
    () => ({ completedStep: completedStepParam }),
    [completedStepParam],
  );

  function refreshAll() {
    void refetch();
    void refetchStats();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[15px] font-bold text-foreground">Recycle Requests</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Track and manage customer device Recycle journeys
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={ROUTES.RECYCLE_OVERVIEW}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium text-muted-foreground transition-colors",
                "hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <LayoutDashboard className="size-3.5" />
              Overview
            </Link>
            <Button
              variant="ghost" size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => refreshAll()}
              disabled={isFetching || statsLoading}
            >
              <RefreshCw className={cn("size-3.5", (isFetching || statsLoading) && "animate-spin")} />
            </Button>
            <Button
              variant="outline" size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleExport}
              disabled={exportLoading}
              title="Export visible journeys to CSV"
            >
              {exportLoading
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Download className="size-3.5" />}
              Export
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> New Request
            </Button>
          </div>
        </div>

        {/* Pipeline strip — step-based funnel */}
        <div className="mt-3.5">
          <PipelineStrip
            byCurrentStep={statsData?.byCurrentStep ?? {}}
            activeStep={pipelineStep}
            onSelect={(k) => { setPipelineStep(k); setPage(1); }}
            loading={isFetching && !!pipelineStep}
          />
        </div>

        {/* Search + status tabs */}
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="relative w-full max-w-xs sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
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
                const href = buildRecycleListPath(key, insightForTabs);
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
                      "inline-flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all outline-none whitespace-nowrap",
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
                      <span className="mr-1.5 relative flex size-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full size-2 bg-amber-500" />
                      </span>
                    )}
                    {label}
                    {statsLoading ? (
                      <span className="ml-1.5 inline-block size-4 animate-pulse rounded-full bg-muted-foreground/20" aria-hidden />
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
        {(search.trim() || hasInsightFilter) ? (
          <p className="text-[10px] text-muted-foreground mt-2 pl-0.5">
            {search.trim() ? (
              <>Search narrows the table. Tab counts are still workspace-wide (same source as Overview).</>
            ) : (
              <>Funnel drill-down is on the URL. Tab counts stay full-workspace.</>
            )}
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-2 pl-0.5">
            Tab counts match Overview. <strong>Certificate Issued</strong> = completed journeys. <strong>Request ↓</strong> = customer declined the pickup request email.
          </p>
        )}
      </div>

      {hasInsightFilter && (
        <div className="shrink-0 border-b border-border bg-muted/20 px-6 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Filtered view: </span>
              {completedStepParam ? (
                <>
                  Journeys that completed{" "}
                  <strong>
                    {RECYCLE_JOURNEY_STEP_LABELS[completedStepParam as keyof typeof RECYCLE_JOURNEY_STEP_LABELS] ??
                      completedStepParam}
                  </strong>
                  .
                </>
              ) : null}
            </p>
            <button
              type="button"
              className="text-[11px] font-semibold text-primary hover:underline"
              onClick={clearInsightFilters}
            >
              Clear filter
            </button>
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border"
        data-dashboard-primary-scroll=""
      >
        {isLoading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border/50 px-6 py-3.5 animate-pulse">
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="h-3 w-36 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="ml-auto h-3 w-16 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : journeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Inbox className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                {search || hasInsightFilter ? "No results found" : "No requests yet"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground max-w-xs">
                {search
                  ? `No requests match "${search}"`
                  : hasInsightFilter
                    ? "No journeys match this overview filter. Try clearing the filter or pick another metric."
                    : "Create your first Recycle request to start a customer device Recycle journey."}
              </p>
            </div>
            {!search && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" /> Create First Request
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10 border-b border-border bg-card">
              <tr>
                {[
                  { h: "Request ID",  cls: "pl-6" },
                  { h: "Customer",    cls: "" },
                  { h: "Item",      cls: "hidden md:table-cell" },
                  { h: "Mode",        cls: "hidden sm:table-cell" },
                  { h: "Progress",    cls: "hidden lg:table-cell" },
                  { h: "Status",      cls: "" },
                  { h: "Created",     cls: "hidden xl:table-cell" },
                  { h: "",            cls: "pr-5" },
                ].map(({ h, cls }) => (
                  <th key={h} className={cn("px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", cls)}>
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
                    onClick={() => router.push(`/dashboard/recycle/${j._id}`)}
                  />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="flex justify-center border-t border-border/50 py-3">
          <Button
            variant="outline" size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}
            Load more
          </Button>
        </div>
      )}

      {/* Footer */}
      {journeys.length > 0 && !isLoading && (
        <div className="shrink-0 border-t border-border/50 px-6 py-2 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            {pipelineStep && (
              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                {PIPELINE_STEPS.find((s) => s.key === pipelineStep)?.short ?? pipelineStep}
              </span>
            )}
            {listTotal > 0
              ? `Showing ${journeys.length} of ${listTotal} · Page ${page} of ${totalPages}`
              : `${journeys.length} request${journeys.length !== 1 ? "s" : ""}`}
          </p>
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            onClick={() => router.push("/settings/sell-template")}
          >
            Workflow Settings →
          </button>
        </div>
      )}

      <AnimatePresence>
        {creating && <CreateModal open={creating} onClose={() => setCreating(false)} />}
      </AnimatePresence>
    </div>
  );
}
