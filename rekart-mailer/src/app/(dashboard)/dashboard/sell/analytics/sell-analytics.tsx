"use client";

import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus,
  Download, RefreshCw, Users, CheckCircle2,
  Banknote, Clock, Percent, BarChart2, Filter,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSellAnalytics } from "@/hooks/use-sell-templates";
import type { JourneyAnalytics, JourneyFunnelStep } from "@/types/sell";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtMoney(n: number, currency?: string): string {
  const c = currency ?? "";
  if (n >= 1_000_000) return `${c} ${(n / 1_000_000).toFixed(2)}M`.trim();
  if (n >= 1_000)     return `${c} ${(n / 1_000).toFixed(1)}K`.trim();
  return `${c} ${n.toLocaleString()}`.trim();
}

function fmtHours(h: number): string {
  if (h < 1)   return `${Math.round(h * 60)}m`;
  if (h < 24)  return `${h.toFixed(1)}h`;
  const days = h / 24;
  return `${days.toFixed(1)}d`;
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const csv  = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Colour palette ─────────────────────────────────────────────────────────────
const COLOR_PRIMARY   = "#6366f1";
const COLOR_GREEN     = "#22c55e";
const COLOR_AMBER     = "#f59e0b";
const COLOR_RED       = "#ef4444";
const COLOR_BLUE      = "#3b82f6";
const COLOR_PURPLE    = "#a855f7";

const PIE_COLORS = [COLOR_PRIMARY, COLOR_GREEN, COLOR_AMBER, COLOR_BLUE, COLOR_PURPLE, COLOR_RED];

// ── Skeleton loader ────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted/60", className)} />;
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string;
  value: string;
  sub?: string;
  trend?: number | null;
  icon: React.ReactNode;
  accent?: string;
}

function KpiCard({ title, value, sub, trend, icon, accent = "bg-primary/10 text-primary" }: KpiCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{title}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", accent)}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {(sub || trend != null) && (
          <div className="mt-1 flex items-center gap-1.5">
            {trend != null && (
              <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold",
                trend > 0 ? "text-green-600" : trend < 0 ? "text-red-500" : "text-muted-foreground"
              )}>
                {trend > 0 ? <TrendingUp className="size-3" /> : trend < 0 ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
                {trend > 0 ? "+" : ""}{trend}%
              </span>
            )}
            {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────────
function Section({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-[12px]">
      {label && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          <span style={{ color: p.color }} className="mr-1 font-medium">{p.name}:</span>
          {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Funnel bar ─────────────────────────────────────────────────────────────────
function FunnelBar({ step, maxCount }: { step: JourneyFunnelStep; maxCount: number }) {
  const pct = maxCount > 0 ? Math.round((step.count / maxCount) * 100) : 0;
  const barColor =
    step.conversionRate > 70 ? "#22c55e" :
    step.conversionRate > 40 ? "#6366f1" :
    step.conversionRate > 20 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex items-center gap-3">
      <div className="w-[148px] shrink-0 text-right">
        <span className="text-[12px] font-medium text-foreground leading-tight">{step.label}</span>
      </div>
      <div className="relative flex-1 h-8">
        <div className="absolute inset-0 rounded-md bg-muted/50" />
        <div
          className="absolute inset-y-0 left-0 rounded-md transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.85 }}
        />
        <div className="absolute inset-0 flex items-center px-3">
          <span className="text-[11px] font-semibold text-white drop-shadow-sm">
            {step.count.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="w-[100px] shrink-0 text-right">
        <span className="text-[12px] font-bold text-foreground">{step.conversionRate}%</span>
        {step.dropOffRate > 0 && (
          <span className="ml-1.5 text-[10px] text-red-500">−{step.dropOffRate}%</span>
        )}
      </div>
    </div>
  );
}

// ── Action label map ───────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  offer_accepted:              "Offer Accepted",
  offer_declined:              "Offer Declined",
  request_received_accepted:   "Request Confirmed",
  request_received_declined:   "Request Declined",
  reschedule_requested:        "Reschedule Requested",
  support_requested:           "Support Requested",
  mail_opened:                 "Mail Opened",
  mail_clicked:                "Mail Clicked",
  track_clicked:               "Tracking Clicked",
};

// ── Main component ─────────────────────────────────────────────────────────────
export function SellAnalyticsClient() {
  const { data, isLoading, isError, refetch, isFetching } = useSellAnalytics();
  const [activeTab, setActiveTab] = useState<"monthly" | "daily">("monthly");

  // ── KPI summary ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!data) return null;
    const totalRevenue = data.revenueByCurrency.reduce((s, r) => s + r.total, 0);
    const completedCount = data.funnel.find((f) => f.step === "completed")?.count ?? 0;
    const conversionRate = data.totalJourneys > 0 ? Math.round((completedCount / data.totalJourneys) * 100) : 0;
    const offerReadyCount = data.funnel.find((f) => f.step === "offer-ready")?.count ?? 0;
    const paymentSentCount = data.funnel.find((f) => f.step === "payment-sent")?.count ?? 0;
    const acceptanceRate = offerReadyCount > 0 ? Math.round((paymentSentCount / offerReadyCount) * 100) : 0;
    return { totalRevenue, completedCount, conversionRate, acceptanceRate };
  }, [data]);

  // ── Customer actions bar data ─────────────────────────────────────────────
  const actionBarData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.actionCounts)
      .map(([k, v]) => ({ name: ACTION_LABELS[k] ?? k, count: v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [data]);

  // ── Export handlers ───────────────────────────────────────────────────────
  function exportMonthlyTrend() {
    if (!data) return;
    downloadCsv(data.monthlyTrend as unknown as Record<string, unknown>[], "monthly-trend.csv");
  }
  function exportFunnel() {
    if (!data) return;
    downloadCsv(data.funnel as unknown as Record<string, unknown>[], "funnel.csv");
  }
  function exportAllData() {
    if (!data) return;
    const rows: Record<string, unknown>[] = data.monthlyTrend.map((m) => ({ type: "monthly", ...m }));
    data.dailyTrend.forEach((d) => rows.push({ type: "daily", ...d }));
    data.funnel.forEach((f) => rows.push({ type: "funnel", ...f }));
    data.revenueByCurrency.forEach((r) => rows.push({ type: "revenue", ...r }));
    downloadCsv(rows, `sell-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[100px]" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[340px]" />
          <Skeleton className="h-[340px]" />
        </div>
        <Skeleton className="h-[280px]" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
      </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-24 text-muted-foreground">
        <BarChart2 className="size-10 opacity-40" />
        <p className="text-sm">Could not load analytics. Please try again.</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }

  const maxFunnelCount = data.funnel[0]?.count ?? 1;
  const totalRevenue   = data.revenueByCurrency.reduce((s, r) => s + r.total, 0);
  const primaryCurrency = data.revenueByCurrency[0]?.currency ?? "";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border">
    <div className="space-y-6 p-4 sm:p-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sell Analytics</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Full business overview — trends, funnel, customer behaviour & revenue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            className="h-8 gap-1.5 text-[12px]"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="default" size="sm"
            className="h-8 gap-1.5 text-[12px]"
            onClick={exportAllData}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Total Requests"
          value={fmtNum(data.totalJourneys)}
          icon={<Users className="size-4" />}
          accent="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
        />
        <KpiCard
          title="This Month"
          value={fmtNum(data.thisMonthJourneys)}
          trend={data.growthRate}
          sub={`vs ${fmtNum(data.lastMonthJourneys)} last mo`}
          icon={<Activity className="size-4" />}
          accent="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
        />
        <KpiCard
          title="Total Revenue"
          value={fmtMoney(totalRevenue, primaryCurrency)}
          sub={data.revenueByCurrency.length > 1 ? `${data.revenueByCurrency.length} currencies` : undefined}
          icon={<Banknote className="size-4" />}
          accent="bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400"
        />
        <KpiCard
          title="Conversion Rate"
          value={`${kpis?.conversionRate ?? 0}%`}
          sub="Request → Completed"
          icon={<Percent className="size-4" />}
          accent="bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400"
        />
        <KpiCard
          title="Acceptance Rate"
          value={`${kpis?.acceptanceRate ?? 0}%`}
          sub="Offer → Payment"
          icon={<CheckCircle2 className="size-4" />}
          accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
        />
        <KpiCard
          title="Avg Completion"
          value={data.avgCompletionHours ? fmtHours(data.avgCompletionHours.avg) : "—"}
          sub={data.avgCompletionHours ? `min ${fmtHours(data.avgCompletionHours.min)} · max ${fmtHours(data.avgCompletionHours.max)}` : "No data yet"}
          icon={<Clock className="size-4" />}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
        />
      </div>

      {/* ── Trend chart + Revenue by currency ── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Monthly / Daily toggle trend */}
        <Section
          title={activeTab === "monthly" ? "Monthly Trend — Last 12 months" : "Daily Activity — Last 30 days"}
          sub={activeTab === "monthly" ? "New requests, completions & revenue" : "New requests per day"}
          action={
            <div className="flex items-center gap-1">
              <div className="flex rounded-lg border border-border p-0.5 text-[11px]">
                <button
                  onClick={() => setActiveTab("monthly")}
                  className={cn("rounded-md px-3 py-1 font-medium transition-colors",
                    activeTab === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >Monthly</button>
                <button
                  onClick={() => setActiveTab("daily")}
                  className={cn("rounded-md px-3 py-1 font-medium transition-colors",
                    activeTab === "daily" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >Daily</button>
              </div>
              <Button variant="ghost" size="icon" className="size-7" onClick={exportMonthlyTrend} title="Export">
                <Download className="size-3" />
              </Button>
            </div>
          }
        >
          <div className="lg:col-span-2">
            {activeTab === "monthly" ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={data.monthlyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  <Bar yAxisId="left" dataKey="requests" name="Requests" fill={COLOR_PRIMARY} radius={[3, 3, 0, 0]} opacity={0.85} />
                  <Bar yAxisId="left" dataKey="completions" name="Completions" fill={COLOR_GREEN} radius={[3, 3, 0, 0]} opacity={0.85} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke={COLOR_AMBER} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.dailyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                    interval={Math.floor(data.dailyTrend.length / 8)}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="requests" name="Requests" fill={COLOR_PRIMARY} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>

        {/* Revenue by currency */}
        <Section title="Revenue by Currency" sub="Completed journeys only">
          {data.revenueByCurrency.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-[12px] text-muted-foreground">No revenue recorded yet</div>
          ) : (
            <div className="flex h-[260px] flex-col justify-center gap-3">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={data.revenueByCurrency}
                    dataKey="total"
                    nameKey="currency"
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={72}
                    paddingAngle={3}
                  >
                    {data.revenueByCurrency.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(typeof v === "number" ? v : Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {data.revenueByCurrency.map((r, i) => (
                  <div key={r.currency} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="font-medium text-foreground">{r.currency}</span>
                      <span className="text-muted-foreground">× {r.count}</span>
                    </div>
                    <span className="font-semibold text-foreground">{fmtMoney(r.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* ── Funnel ── */}
      <Section
        title="Journey Funnel"
        sub="How many requests progress through each stage"
        action={
          <Button variant="ghost" size="icon" className="size-7" onClick={exportFunnel} title="Export funnel">
            <Download className="size-3" />
          </Button>
        }
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <div className="w-[148px] shrink-0 text-right">Stage</div>
            <div className="flex-1">Progress</div>
            <div className="w-[100px] shrink-0 text-right">Reached · Drop</div>
          </div>
          {data.funnel.map((step) => (
            <FunnelBar key={step.step} step={step} maxCount={maxFunnelCount} />
          ))}
        </div>

        {/* Funnel summary pills */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          {data.funnel.filter((f) => f.dropOffRate > 0).map((f) => (
            <span key={f.step} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[10px] font-medium">
              <span className="text-foreground">{f.label}</span>
              <span className="text-red-500">−{f.dropOffRate}% drop-off</span>
            </span>
          ))}
        </div>
      </Section>

      {/* ── Customer actions + Revenue trend area ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Customer action bar */}
        <Section title="Customer Actions" sub="All-time actions taken by customers on emails">
          {actionBarData.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center text-[12px] text-muted-foreground">No customer actions recorded yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={actionBarData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                  {actionBarData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* Revenue area trend */}
        <Section title="Revenue Trend" sub="Monthly revenue (last 12 months)">
          {data.monthlyTrend.every((m) => m.revenue === 0) ? (
            <div className="flex h-[240px] items-center justify-center text-[12px] text-muted-foreground">No revenue data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.monthlyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={COLOR_GREEN} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={COLOR_GREEN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={COLOR_GREEN} strokeWidth={2} fill="url(#revGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* ── Completion trend: requests vs cancellations ── */}
      <Section title="Health Overview" sub="Requests vs cancellations + declines per month">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.monthlyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={COLOR_PRIMARY} stopOpacity={0.2} />
                <stop offset="95%" stopColor={COLOR_PRIMARY} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cancelGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={COLOR_RED} stopOpacity={0.2} />
                <stop offset="95%" stopColor={COLOR_RED} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
            <Area type="monotone" dataKey="requests"      name="Requests"         stroke={COLOR_PRIMARY} strokeWidth={2} fill="url(#reqGrad)"    dot={false} />
            <Area type="monotone" dataKey="completions"   name="Completions"      stroke={COLOR_GREEN}   strokeWidth={2} fill="none"              dot={false} strokeDasharray="4 2" />
            <Area type="monotone" dataKey="cancellations" name="Declines/Cancels" stroke={COLOR_RED}     strokeWidth={2} fill="url(#cancelGrad)"  dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      {/* ── Data table: funnel detail ── */}
      <Section
        title="Funnel Detail Table"
        sub="Step-by-step breakdown with exact numbers"
        action={
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Filter className="size-3" />
            All time
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-4">Stage</th>
                <th className="pb-2 pr-4 text-right">Journeys</th>
                <th className="pb-2 pr-4 text-right">% of Total</th>
                <th className="pb-2 pr-4 text-right">Drop from Prev</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.funnel.map((f) => (
                <tr key={f.step} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2 pr-4 font-medium text-foreground">{f.label}</td>
                  <td className="py-2 pr-4 text-right font-semibold text-foreground">{f.count.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right">
                    <span className={cn("font-semibold",
                      f.conversionRate > 70 ? "text-green-600" :
                      f.conversionRate > 40 ? "text-primary"   :
                      f.conversionRate > 20 ? "text-amber-500"  : "text-red-500"
                    )}>
                      {f.conversionRate}%
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {f.dropOffRate > 0
                      ? <span className="text-red-500">−{f.dropOffRate}%</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border text-[11px] font-semibold">
                <td className="pt-2 text-foreground">Overall completion</td>
                <td className="pt-2 text-right text-foreground">{(data.funnel.find((f) => f.step === "completed")?.count ?? 0).toLocaleString()}</td>
                <td className="pt-2 text-right text-foreground">{kpis?.conversionRate ?? 0}%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

    </div>
    </div>
    </div>
  );
}
