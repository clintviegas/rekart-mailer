import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Plus, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Campaigns" };

const CAMPAIGNS = [
  { id: "1", name: "Spring Sale Newsletter", status: "sent", recipients: 12400, openRate: "38.2%", date: "Mar 18, 2026" },
  { id: "2", name: "Product Launch Announcement", status: "scheduled", recipients: 8900, openRate: "—", date: "Mar 25, 2026" },
  { id: "3", name: "Weekly Digest #12", status: "sent", recipients: 15200, openRate: "29.7%", date: "Mar 15, 2026" },
  { id: "4", name: "Re-engagement Campaign", status: "draft", recipients: 3400, openRate: "—", date: "—" },
  { id: "5", name: "Q1 Recap & Updates", status: "paused", recipients: 6700, openRate: "21.3%", date: "Mar 10, 2026" },
  { id: "6", name: "Onboarding Welcome Series", status: "sent", recipients: 2100, openRate: "61.4%", date: "Mar 8, 2026" },
];

const STATUS_CLASSES: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function CampaignsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader title="Campaigns" description="Create and manage your email campaigns.">
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          New Campaign
        </Button>
      </PageHeader>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search campaigns..." className="pl-9" />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 sm:w-auto">
          <Filter className="size-3.5" />
          Filter
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Campaign</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Recipients</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Open Rate</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {CAMPAIGNS.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-[11px] capitalize ${STATUS_CLASSES[c.status]}`}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {c.recipients.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{c.openRate}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{c.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
