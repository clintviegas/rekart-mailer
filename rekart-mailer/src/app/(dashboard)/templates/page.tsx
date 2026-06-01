import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Plus, Search, LayoutTemplate } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Templates" };

const TEMPLATES = [
  { id: "1", name: "Welcome Email", category: "Onboarding", lastEdited: "Mar 18" },
  { id: "2", name: "Newsletter #1", category: "Newsletter", lastEdited: "Mar 14" },
  { id: "3", name: "Product Update", category: "Marketing", lastEdited: "Mar 10" },
  { id: "4", name: "Re-engagement", category: "Automation", lastEdited: "Mar 5" },
  { id: "5", name: "Cart Abandonment", category: "E-commerce", lastEdited: "Feb 28" },
  { id: "6", name: "Event Invitation", category: "Events", lastEdited: "Feb 22" },
];

export default function TemplatesPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader title="Templates" description="Design and manage reusable email templates.">
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          New Template
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search templates..." className="pl-9" />
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <div
            key={t.id}
            className="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm"
          >
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <LayoutTemplate className="size-5 text-primary" />
            </div>
            <h3 className="font-medium text-foreground">{t.name}</h3>
            <div className="mt-2 flex items-center justify-between">
              <Badge variant="secondary" className="text-[11px]">{t.category}</Badge>
              <span className="text-xs text-muted-foreground">Edited {t.lastEdited}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
