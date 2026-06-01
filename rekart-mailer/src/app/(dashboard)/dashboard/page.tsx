import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCards } from "@/modules/dashboard/components/stats-cards";
import { RecentCampaigns } from "@/modules/dashboard/components/recent-campaigns";
import { EmailPerformanceChart } from "@/components/charts/email-performance-chart";
import { CampaignStatusChart } from "@/components/charts/campaign-status-chart";
import { DashboardGreeting } from "@/modules/dashboard/components/dashboard-greeting";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="h-full overflow-y-auto" data-dashboard-primary-scroll="">
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <DashboardGreeting />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="size-3.5" />
            Export
          </Button>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-3.5" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Stats */}
      <StatsCards />

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Performance Chart */}
        <div className="col-span-full rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Email Performance</h3>
              <p className="text-xs text-muted-foreground">Last 90 days</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-primary" />
                Sent
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: "oklch(0.626 0.19 240)" }}
                />
                Opened
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: "oklch(0.688 0.155 220)" }}
                />
                Clicked
              </span>
            </div>
          </div>
          <EmailPerformanceChart />
        </div>

        {/* Donut Chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Campaign Status</h3>
            <p className="text-xs text-muted-foreground">Distribution overview</p>
          </div>
          <CampaignStatusChart />
        </div>
      </div>

      {/* Recent Campaigns */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recent Campaigns</h3>
            <p className="text-xs text-muted-foreground">Your latest campaign activity</p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            View all
          </Button>
        </div>
        <RecentCampaigns />
      </div>
    </div>
    </div>
  );
}
