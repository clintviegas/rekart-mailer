"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  status: "sent" | "draft" | "scheduled" | "paused";
  openRate: string;
  recipients: number;
  date: string;
}

const CAMPAIGNS: Campaign[] = [
  { id: "1", name: "Spring Sale Newsletter", status: "sent", openRate: "38.2%", recipients: 12400, date: "Mar 18" },
  { id: "2", name: "Product Launch Announcement", status: "scheduled", openRate: "—", recipients: 8900, date: "Mar 25" },
  { id: "3", name: "Weekly Digest #12", status: "sent", openRate: "29.7%", recipients: 15200, date: "Mar 15" },
  { id: "4", name: "Re-engagement Campaign", status: "draft", openRate: "—", recipients: 3400, date: "—" },
  { id: "5", name: "Q1 Recap & Updates", status: "paused", openRate: "21.3%", recipients: 6700, date: "Mar 10" },
];

const STATUS_CONFIG = {
  sent: { label: "Sent", variant: "default" as const, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  draft: { label: "Draft", variant: "secondary" as const, className: "" },
  scheduled: { label: "Scheduled", variant: "secondary" as const, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  paused: { label: "Paused", variant: "secondary" as const, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
};

export function RecentCampaigns() {
  return (
    <div className="space-y-1">
      {CAMPAIGNS.map((campaign, i) => (
        <motion.div
          key={campaign.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: i * 0.05 }}
          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{campaign.name}</p>
            <p className="text-xs text-muted-foreground">
              {campaign.recipients.toLocaleString()} recipients · {campaign.date}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {campaign.openRate !== "—" && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                {campaign.openRate}
              </span>
            )}
            <Badge
              className={cn(
                "shrink-0 text-[11px]",
                STATUS_CONFIG[campaign.status].className
              )}
            >
              {STATUS_CONFIG[campaign.status].label}
            </Badge>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
