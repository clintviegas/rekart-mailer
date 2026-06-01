"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  Banknote,
  RefreshCw,
  ArrowUpRight,
  MailCheck,
  Truck,
  Package,
  Clock,
  ChevronRight,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeDDMMYY } from "@/lib/date-format";
import { Button } from "@/components/ui/button";
import { useRentStats } from "@/hooks/use-rent-journeys";
import { ROUTES } from "@/constants/routes";
import {
  RENT_JOURNEY_WORKFLOW_STEPS,
  RENT_JOURNEY_STEP_LABELS,
  type RentRequestJourney,
  type RentReturnDueFollowUpItem,
} from "@/types/rent";
import { rentReturnDueBadgeClass, rentReturnDueBadgeLabel, sortRentJourneysByReturnDueAsc } from "@/lib/rent-return-due";

function fmtCurrency(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  iconColor: string;
  delay?: number;
  href?: string;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  iconColor,
  delay = 0,
  href,
}: StatCardProps) {
  const inner = (
    <>
      <div className={cn("flex size-9 items-center justify-center rounded-lg", color)}>
        <Icon className={cn("size-4", iconColor)} />
      </div>
      <div>
        <p className="text-[24px] font-extrabold leading-none tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</p>}
      </div>
    </>
  );

  const shellClass = cn(
    "flex flex-col gap-3 rounded-xl border border-border bg-card p-5",
    href && "cursor-pointer transition-colors hover:border-primary/20 hover:bg-muted/15 hover:shadow-md",
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      {href ? (
        <Link href={href} className={cn(shellClass, "block")}>
          {inner}
        </Link>
      ) : (
        <div className={shellClass}>{inner}</div>
      )}
    </motion.div>
  );
}

function FunnelBar({
  step,
  count,
  max,
}: {
  step: string;
  count: number;
  max: number;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const label = RENT_JOURNEY_STEP_LABELS[step as keyof typeof RENT_JOURNEY_STEP_LABELS] ?? step;

  return (
    <div className="flex items-center gap-3">
      <span className="w-[130px] shrink-0 truncate text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] font-bold tabular-nums">{count}</span>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

export function RentOverviewClient() {
  const router = useRouter();
  const { data: stats, isLoading, refetch, isFetching } = useRentStats();

  const total = stats?.total ?? 0;
  const byStatus = stats?.byStatus ?? { active: 0, completed: 0, cancelled: 0 };
  const byStep = stats?.byStep ?? {};
  const byFulfillment = stats?.byFulfillment ?? { pickup: 0, delivery: 0, pending: 0 };
  const revenue = stats?.totalRevenue ?? 0;
  const returnOverdueCount = stats?.returnOverdueCount ?? 0;
  const returnDueTodayCount = stats?.returnDueTodayCount ?? 0;
  const returnDueSoonCount = stats?.returnDueSoonCount ?? 0;
  const returnDueFollowUp = useMemo(
    () => sortRentJourneysByReturnDueAsc((stats?.returnDueFollowUp ?? []) as RentReturnDueFollowUpItem[]),
    [stats?.returnDueFollowUp],
  );
  const recentJourneys = (stats?.recentJourneys ?? []) as RentRequestJourney[];
  const maxStepCount = Math.max(
    ...RENT_JOURNEY_WORKFLOW_STEPS.map((s) => byStep[s] ?? 0),
    1,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-bold text-foreground">Rent Overview</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Real-time summary of rental journeys — requests, fulfillment & revenue
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => router.push(ROUTES.RENT)}
            >
              View All Requests
              <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div
        className="flex-1 space-y-6 overflow-y-auto px-6 py-5"
        data-dashboard-primary-scroll=""
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-5">
                <Skeleton className="size-9 rounded-lg" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))
          ) : (
            <>
              <StatCard delay={0} label="Total Requests" value={total} icon={Users} color="bg-blue-50 dark:bg-blue-950/40" iconColor="text-blue-600" href={ROUTES.RENT} />
              <StatCard delay={0.05} label="Active" value={byStatus.active} icon={KeyRound} color="bg-violet-50 dark:bg-violet-950/40" iconColor="text-violet-600" href={`${ROUTES.RENT}?status=active`} />
              <StatCard delay={0.1} label="Closed" value={byStatus.completed} icon={CheckCircle2} color="bg-emerald-50 dark:bg-emerald-950/40" iconColor="text-emerald-600" href={`${ROUTES.RENT}?status=completed`} />
              <StatCard delay={0.15} label="Cancelled" value={byStatus.cancelled} icon={XCircle} color="bg-slate-100 dark:bg-slate-800/40" iconColor="text-slate-500" href={`${ROUTES.RENT}?status=cancelled`} />
              <StatCard delay={0.2} label="Pickup" value={byFulfillment.pickup} icon={Package} color="bg-sky-50 dark:bg-sky-950/40" iconColor="text-sky-600" sub="Customer confirmed" />
              <StatCard delay={0.25} label="Delivery" value={byFulfillment.delivery} icon={Truck} color="bg-orange-50 dark:bg-orange-950/40" iconColor="text-orange-600" sub="Customer confirmed" />
              <StatCard delay={0.3} label="Total Revenue" value={fmtCurrency(revenue)} icon={Banknote} color="bg-teal-50 dark:bg-teal-950/40" iconColor="text-teal-600" sub="From closed rentals" />
              <StatCard delay={0.35} label="Return Overdue" value={returnOverdueCount} icon={AlertTriangle} color="bg-red-50 dark:bg-red-950/40" iconColor="text-red-600" sub="Needs call now" href={`${ROUTES.RENT}?tab=return_due`} />
            </>
          )}
        </div>

        {!isLoading && returnDueFollowUp.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            className="rounded-xl border border-amber-200/80 bg-amber-50/30 p-5 dark:border-amber-900/40 dark:bg-amber-950/10"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-bold text-foreground">Returns to follow up</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Active rentals out with customer — overdue, due today, or due within 7 days
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                {returnOverdueCount > 0 ? (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                    {returnOverdueCount} overdue
                  </span>
                ) : null}
                {returnDueTodayCount > 0 ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    {returnDueTodayCount} due today
                  </span>
                ) : null}
                {returnDueSoonCount > 0 ? (
                  <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 font-semibold text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200">
                    {returnDueSoonCount} due soon
                  </span>
                ) : null}
              </div>
            </div>
            <div className="divide-y divide-border/60 rounded-lg border border-border bg-card">
              {returnDueFollowUp.map((j) => {
                const status = String(j.returnDueStatus ?? "upcoming");
                const badge = rentReturnDueBadgeLabel(status as never);
                return (
                  <button
                    key={j._id}
                    type="button"
                    onClick={() => router.push(ROUTES.RENT_DETAIL(j._id))}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-foreground">
                        {j.requestId} · {j.customerName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{j.customerEmail}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[12px] font-semibold tabular-nums text-foreground">
                        {j.returnDueLabel}
                      </p>
                      {badge ? (
                        <span
                          className={cn(
                            "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            rentReturnDueBadgeClass(status as never),
                          )}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end">
              <Link
                href={`${ROUTES.RENT}?tab=return_due`}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                View all return due
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </motion.div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-5">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl border border-border bg-card p-5 lg:col-span-3"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[13px] font-bold text-foreground">Journey Funnel</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Requests that completed each workflow step
                </p>
              </div>
              <MailCheck className="size-4 text-muted-foreground" />
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {RENT_JOURNEY_WORKFLOW_STEPS.map((step) => (
                  <FunnelBar key={step} step={step} count={byStep[step] ?? 0} max={maxStepCount} />
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-xl border border-border bg-card p-5 lg:col-span-2"
          >
            <div className="mb-4">
              <p className="text-[13px] font-bold text-foreground">Fulfillment pending</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Waiting for customer to choose pickup or delivery on email confirm
              </p>
            </div>
            {!isLoading && (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Clock className="size-8 text-amber-500" />
                <p className="text-[28px] font-extrabold text-foreground">{byFulfillment.pending}</p>
                <p className="text-[11px] text-muted-foreground">requests pending customer choice</p>
              </div>
            )}
            {!isLoading && stats?.agreementSignedCount != null && (
              <div className="mt-4 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">
                  Agreements signed:{" "}
                  <span className="font-bold text-foreground">{stats.agreementSignedCount}</span>
                </p>
              </div>
            )}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] font-bold text-foreground">Recent Requests</p>
            <Link href={ROUTES.RENT_ANALYTICS} className="text-[11px] font-semibold text-primary hover:underline">
              Full analytics →
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentJourneys.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-muted-foreground">No requests yet</p>
          ) : (
            <div className="divide-y divide-border/60">
              {recentJourneys.map((j) => (
                <Link
                  key={j._id}
                  href={ROUTES.RENT_DETAIL(j._id)}
                  className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-lg"
                >
                  <code className="font-mono text-[11px] font-bold">{j.requestId}</code>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold">{j.customerName}</p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(j.createdAt)}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                    {j.status}
                  </span>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
