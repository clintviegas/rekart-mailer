"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TrendingUp, Users, CheckCircle2, XCircle, Banknote,
  MailCheck, RefreshCw, ArrowUpRight, Clock, Percent,
  AlertCircle, ChevronRight, Activity, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeDDMMYY } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { useRecycleStats } from "@/hooks/use-recycle-journeys";
import {
  RECYCLE_JOURNEY_WORKFLOW_STEPS,
  RECYCLE_JOURNEY_STEP_LABELS,
  RecycleJourneyStepLabel,
} from "@/types/recycle";
import type { RecycleRequestJourney, RecycleJourneyAction, JourneyActionType, JourneyStatus } from "@/types/recycle";
import {
  formatJourneyMoneyDisplay,
  getJourneyMoneyHighlight,
} from "@/lib/sell-estimated-price";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)     return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString();
}

function fmtDate(iso: string): string {
  return formatDateTimeDDMMYY(iso);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Stat card ──────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.FC<{ className?: string }>;
  color: string;   // tailwind bg class for icon bg
  iconColor: string;
  trend?: { value: string; positive: boolean } | null;
  delay?: number;
  /** When set, entire card navigates to this path (requests list / drill-down). */
  href?: string;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  iconColor,
  trend,
  delay = 0,
  href,
}: StatCardProps) {
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className={cn("flex size-9 items-center justify-center rounded-lg", color)}>
          <Icon className={cn("size-4", iconColor)} />
        </div>
        {trend && (
          <span className={cn(
            "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold",
            trend.positive
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
          )}>
            <TrendingUp className={cn("size-2.5", !trend.positive && "rotate-180")} />
            {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-[24px] font-extrabold text-foreground leading-none tracking-tight">{value}</p>
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </>
  );

  const shellClass = cn(
    "rounded-xl border border-border bg-card p-5 flex flex-col gap-3",
    href &&
      "cursor-pointer transition-shadow transition-colors hover:shadow-md hover:border-primary/20 hover:bg-muted/15",
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: "easeOut" }}
    >
      {href ? (
        <Link
          href={href}
          className={cn(
            shellClass,
            "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          {inner}
        </Link>
      ) : (
        <div className={shellClass}>{inner}</div>
      )}
    </motion.div>
  );
}

// ── Step funnel bar ────────────────────────────────────────────────────────────

function FunnelBar({
  step,
  count,
  max,
  href,
}: {
  step: string;
  count: number;
  max: number;
  href: string;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const label = RecycleJourneyStepLabel(step);

  const STEP_COLOR: Record<string, string> = {
    "booking-confirmed":    "bg-blue-500",
    "pickup-scheduled":    "bg-violet-500",
    "diagnosing": "bg-amber-500",
    "quote-ready":         "bg-orange-500",
    "Recycle-in-progress":        "bg-emerald-500",
    "device-ready":          "bg-teal-500",
    "device-returned":       "bg-teal-600",
  };
  const color = STEP_COLOR[step] ?? "bg-primary";

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg -mx-2 px-2 py-1.5 -my-0.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="w-[130px] shrink-0 text-[11px] font-medium text-muted-foreground truncate group-hover:text-foreground transition-colors">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] font-bold text-foreground tabular-nums">{count}</span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </Link>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { dot: string; text: string; bg: string }> = {
  all:           { dot: "bg-slate-600 dark:bg-slate-400", text: "text-slate-800 dark:text-slate-100", bg: "bg-slate-50 dark:bg-slate-900/45 border-slate-200 dark:border-slate-600/60" },
  active:        { dot: "bg-blue-500",    text: "text-blue-700 dark:text-blue-300",    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
  completed:     { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" },
  cancelled:     { dot: "bg-slate-400",   text: "text-slate-500 dark:text-slate-400",  bg: "bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700" },
  quote_declined:{ dot: "bg-red-500",     text: "text-red-700 dark:text-red-300",      bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
  request_declined: { dot: "bg-orange-500", text: "text-orange-800 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
  booking_declined: { dot: "bg-orange-500", text: "text-orange-800 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
  no_customer_action: { dot: "bg-slate-400", text: "text-slate-700 dark:text-slate-300", bg: "bg-slate-100 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.active;
  const label =
    status === "request_declined" || status === "booking_declined" || status === "quote_declined"
      ? "Request declined"
      : status === "completed"
        ? "Certificate issued"
        : status === "no_customer_action"
          ? "No response"
          : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", s.bg, s.text)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {label}
    </span>
  );
}

// ── Action meta ────────────────────────────────────────────────────────────────

const ACTION_META: Partial<Record<JourneyActionType, { icon: string; label: string }>> = {
  mail_opened:          { icon: "📬", label: "Email Opened" },
  mail_clicked:         { icon: "🖱️",  label: "Link Clicked" },
  recycle_request_accepted: { icon: "✅", label: "Request Confirmed" },
  recycle_request_declined: { icon: "✖️", label: "Request Declined" },
  request_received_accepted: { icon: "✅", label: "Request Confirmed" },
  request_received_declined: { icon: "✖️", label: "Request Declined" },
  reschedule_requested: { icon: "📅", label: "Reschedule Requested" },
  receipt_viewed:       { icon: "🧾", label: "Receipt Viewed" },
  rating_submitted:     { icon: "⭐", label: "Rating Submitted" },
  support_requested:    { icon: "💬", label: "Support Requested" },
  journey_auto_closed:  { icon: "⏱️", label: "Auto-closed (no response)" },
};

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RecycleOverviewClient() {
  const router = useRouter();
  const { data: stats, isLoading, refetch, isFetching } = useRecycleStats();

  const total         = stats?.total ?? 0;
  const byStatus =
    stats?.byStatus ?? {
      active: 0,
      completed: 0,
      cancelled: 0,
      quote_declined: 0,
      booking_declined: 0,
      no_customer_action: 0,
    };
  const byStep        = stats?.byStep ?? {};
  const revenue       = stats?.totalRevenue ?? 0;
  const acceptRate    = stats?.acceptanceRate ?? 0;
  const recentJourneys = (stats?.recentJourneys ?? []) as RecycleRequestJourney[];
  const recentActions  = (stats?.recentActions  ?? []) as RecycleJourneyAction[];
  const revisedQuoteJourneys = stats?.revisedQuoteJourneys ?? 0;
  const totalRevisedQuoteEmails = stats?.totalRevisedQuoteEmails ?? 0;
  const journeysClosedByReship = stats?.journeysClosedByReship ?? 0;
  const maxStepCount  = Math.max(
    ...RECYCLE_JOURNEY_WORKFLOW_STEPS.map((s) => byStep[s] ?? 0),
    journeysClosedByReship,
    1,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-bold text-foreground">Recycle Overview</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Real-time summary of all Recycle request journeys and email activity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost" size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm" className="h-7 gap-1.5 text-xs"
              onClick={() => router.push("/dashboard/recycle")}
            >
              View All Requests
              <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border px-6 py-5 space-y-6"
        data-dashboard-primary-scroll=""
      >

        {/* ── KPI row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="space-y-1">
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))
          ) : (
            <>
              <StatCard delay={0}    label="Total Requests"   value={total}              icon={Users}        color="bg-blue-50 dark:bg-blue-950/40"    iconColor="text-blue-600 dark:text-blue-400" href="/dashboard/recycle" />
              <StatCard delay={0.05} label="Active"           value={byStatus.active}    icon={Activity}     color="bg-violet-50 dark:bg-violet-950/40" iconColor="text-violet-600 dark:text-violet-400" href="/dashboard/recycle?status=active" />
              <StatCard delay={0.1}  label="Certificate Issued" value={byStatus.completed} icon={CheckCircle2} color="bg-emerald-50 dark:bg-emerald-950/40" iconColor="text-emerald-600 dark:text-emerald-400" href="/dashboard/recycle?status=completed" />
              <StatCard delay={0.15} label="Request Declined" value={byStatus.request_declined ?? byStatus.booking_declined ?? byStatus.quote_declined ?? 0} icon={XCircle} color="bg-orange-50 dark:bg-orange-950/40" iconColor="text-orange-600 dark:text-orange-400" href="/dashboard/recycle?status=request_declined" />
              <StatCard delay={0.2}  label="Reminder Due" value={stats?.reminderDueCount ?? 0} icon={Clock} color="bg-amber-50 dark:bg-amber-950/40" iconColor="text-amber-600 dark:text-amber-400" href="/dashboard/recycle?status=reminder_due" />
              <StatCard delay={0.25} label="No Response" value={byStatus.no_customer_action} icon={AlertCircle} color="bg-slate-50 dark:bg-slate-900/40" iconColor="text-slate-600 dark:text-slate-400" href="/dashboard/recycle?status=no_customer_action" />
            </>
          )}
        </div>

        {/* Collection funnel by step */}
        <div className="grid gap-4 lg:grid-cols-5">

          {/* Step funnel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="lg:col-span-3 rounded-xl border border-border bg-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[13px] font-bold text-foreground">Journey Funnel</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  How many requests completed each step — <span className="font-medium text-foreground/80">click a row</span>{" "}
                  to open the filtered request list.
                </p>
              </div>
              <MailCheck className="size-4 text-muted-foreground" />
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-3 w-[130px]" />
                    <Skeleton className="h-2 flex-1" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {RECYCLE_JOURNEY_WORKFLOW_STEPS.map((step) => (
                  <FunnelBar
                    key={step}
                    step={step}
                    count={byStep[step] ?? 0}
                    max={maxStepCount}
                    href={`/dashboard/recycle?completedStep=${encodeURIComponent(step)}`}
                  />
                ))}
              </div>
            )}
          </motion.div>

          {/* Status distribution */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="lg:col-span-2 rounded-xl border border-border bg-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[13px] font-bold text-foreground">Status Split</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Workspace totals — <span className="font-medium text-foreground/80">open a row</span> for the full request list with the same status tabs.
                </p>
              </div>
              <TrendingUp className="size-4 text-muted-foreground" />
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-2.5">
                <Link
                  href="/dashboard/recycle"
                  scroll={false}
                  className={cn(
                    "group flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                    "hover:brightness-[0.97] dark:hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    STATUS_STYLE.all.bg,
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", STATUS_STYLE.all.dot)} />
                    <span className={cn("text-[12px] font-semibold", STATUS_STYLE.all.text)}>All requests</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-black/10 overflow-hidden">
                      <motion.div
                        className={cn("h-full rounded-full", STATUS_STYLE.all.dot)}
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.5, delay: 0.35 }}
                      />
                    </div>
                    <span className={cn("text-[12px] font-extrabold tabular-nums", STATUS_STYLE.all.text)}>{total}</span>
                    <span className="text-[10px] text-muted-foreground/70">(100%)</span>
                    <ChevronRight className="size-3.5 shrink-0 text-border opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </div>
                </Link>
                {(["active", "completed", "request_declined", "no_customer_action", "cancelled"] as const).map((s) => {
                  const count =
                    s === "request_declined"
                      ? (byStatus.request_declined ?? byStatus.booking_declined ?? byStatus.quote_declined ?? 0)
                      : (byStatus[s] ?? 0);
                  const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                  const label =
                    s === "request_declined"
                      ? "Request Declined"
                      : s === "completed"
                        ? "Certificate Issued"
                        : s === "no_customer_action"
                          ? "No Response"
                          : s.charAt(0).toUpperCase() + s.slice(1);
                  const style = STATUS_STYLE[s] ?? STATUS_STYLE.active;
                  const href = `/dashboard/recycle?status=${s}`;
                  return (
                    <Link
                      key={s}
                      href={href}
                      scroll={false}
                      className={cn(
                        "group flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                        "hover:brightness-[0.97] dark:hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        style.bg,
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", style.dot)} />
                        <span className={cn("text-[12px] font-semibold", style.text)}>{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-black/10 overflow-hidden">
                          <motion.div
                            className={cn("h-full rounded-full", style.dot)}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, delay: 0.4 }}
                          />
                        </div>
                        <span className={cn("text-[12px] font-extrabold tabular-nums", style.text)}>{count}</span>
                        <span className="text-[10px] text-muted-foreground/70">({pct}%)</span>
                        <ChevronRight className="size-3.5 shrink-0 text-border opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Bottom row: Recent requests + Activity ─────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-5">

          {/* Recent requests */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div>
                <p className="text-[13px] font-bold text-foreground">Recent Requests</p>
                <p className="text-[10px] text-muted-foreground">Latest 5 Recycle request journeys</p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/dashboard/recycle")}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
              >
                See all <ChevronRight className="size-3" />
              </button>
            </div>

            {isLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentJourneys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <AlertCircle className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No requests yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentJourneys.map((j) => {
                  const highlight = getJourneyMoneyHighlight(j.dynamicData as Record<string, unknown>);
                  const moneyLine =
                    highlight != null
                      ? `${j.currency} ${formatJourneyMoneyDisplay("", highlight.display).trim()}`
                      : null;
                  return (
                    <button
                      key={j._id}
                      type="button"
                      onClick={() => router.push(`/dashboard/recycle/${j._id}`)}
                      className="group flex w-full items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                    >
                      {/* Avatar */}
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {j.customerName.charAt(0).toUpperCase()}
                      </div>
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-foreground truncate">{j.customerName}</span>
                          <code className="text-[10px] text-muted-foreground">{j.requestId}</code>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock className="size-2.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{fmtDate(j.createdAt as unknown as string)}</span>
                        </div>
                      </div>
                      {/* Right */}
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <StatusPill status={j.status as string} />
                        {moneyLine != null && (
                          <span className="text-[10px] font-bold text-foreground tabular-nums">
                            {moneyLine}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="size-3.5 shrink-0 text-border group-hover:text-primary transition-colors" />
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Customer activity feed */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden"
          >
            <div className="border-b border-border px-5 py-3.5">
              <p className="text-[13px] font-bold text-foreground">Customer Activity</p>
              <p className="text-[10px] text-muted-foreground">Recent customer interactions via email</p>
            </div>

            <div className="overflow-y-auto max-h-[340px] scrollbar-thin scrollbar-thumb-border divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-4 py-3">
                    <Skeleton className="size-6 rounded-full mt-0.5 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                    <Skeleton className="h-2.5 w-10 shrink-0" />
                  </div>
                ))
              ) : recentActions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Activity className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                  <p className="text-[11px] text-muted-foreground/70">Actions appear when customers click email buttons</p>
                </div>
              ) : (
                recentActions.map((a) => {
                  const m = ACTION_META[a.actionType] ?? { icon: "•", label: a.actionType };
                  const journeyId = a.journeyId ? String(a.journeyId) : "";
                  return (
                    <button
                      key={a._id}
                      type="button"
                      disabled={!journeyId}
                      onClick={() => journeyId && router.push(`/dashboard/recycle/${journeyId}`)}
                      className={cn(
                        "group flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors",
                        journeyId
                          ? "hover:bg-muted/40 cursor-pointer"
                          : "cursor-default opacity-60",
                      )}
                    >
                      <span className="shrink-0 mt-0.5 text-base leading-none">{m.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-foreground">{m.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {RECYCLE_JOURNEY_STEP_LABELS[(a.step as keyof typeof RECYCLE_JOURNEY_STEP_LABELS)] ?? a.step}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {timeAgo(a.createdAt as unknown as string)}
                        </span>
                        {journeyId ? (
                          <ChevronRight className="size-3.5 text-border group-hover:text-primary transition-colors" />
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Quick action row ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4 pb-2"
        >
          {[
            { label: "New Request",    sub: "Start a Recycle journey",       href: "/dashboard/recycle",         icon: Users,        color: "text-primary" },
            { label: "Email Design",   sub: "Branding & design settings", href: "/dashboard/recycle/design",  icon: TrendingUp,   color: "text-violet-600 dark:text-violet-400" },
            { label: "Active Journeys",sub: `${byStatus.active} in progress`, href: "/dashboard/recycle?status=active", icon: Activity, color: "text-blue-600 dark:text-blue-400" },
            { label: "Certificate Issued", sub: `${byStatus.completed} journeys done`, href: "/dashboard/recycle?status=completed", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
          ].map(({ label, sub, href, icon: Icon, color }) => (
            <button
              key={label}
              type="button"
              onClick={() => router.push(href)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
            >
              <Icon className={cn("size-4 shrink-0", color)} />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
              </div>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-border group-hover:text-foreground transition-colors" />
            </button>
          ))}
        </motion.div>

      </div>
    </div>
  );
}
