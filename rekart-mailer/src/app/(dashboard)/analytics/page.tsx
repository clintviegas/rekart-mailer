import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { EmailPerformanceChart } from "@/components/charts/email-performance-chart";

export const metadata: Metadata = { title: "Analytics" };

const METRICS = [
  { label: "Total Sent", value: "1.24M", sub: "+12.5% this month" },
  { label: "Avg. Open Rate", value: "34.6%", sub: "+2.1 pts" },
  { label: "Avg. Click Rate", value: "8.4%", sub: "-1.3 pts" },
  { label: "Unsubscribe Rate", value: "0.3%", sub: "Below industry avg." },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader title="Analytics" description="Deep dive into your email performance metrics.">
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="size-3.5" />
          Export Report
        </Button>
      </PageHeader>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{m.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Performance Over Time</h3>
          <p className="text-xs text-muted-foreground">Last 90 days — sent, opened, clicked</p>
        </div>
        <EmailPerformanceChart />
      </div>
    </div>
  );
}
