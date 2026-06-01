import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const metadata: Metadata = { title: "Contacts" };

const CONTACTS = [
  { id: "1", name: "Alice Johnson", email: "alice@example.com", status: "subscribed", tags: ["VIP", "Beta"] },
  { id: "2", name: "Bob Smith", email: "bob@example.com", status: "subscribed", tags: ["Customer"] },
  { id: "3", name: "Carol White", email: "carol@example.com", status: "unsubscribed", tags: [] },
  { id: "4", name: "David Lee", email: "david@example.com", status: "subscribed", tags: ["Lead"] },
  { id: "5", name: "Emma Davis", email: "emma@example.com", status: "bounced", tags: [] },
];

const STATUS_CLASSES: Record<string, string> = {
  subscribed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  unsubscribed: "bg-muted text-muted-foreground",
  bounced: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function ContactsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader title="Contacts" description="Manage your subscriber list and segments.">
        <Button variant="outline" size="sm" className="gap-1.5">
          <Upload className="size-3.5" />
          Import
        </Button>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          Add Contact
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search contacts..." className="pl-9" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Tags</th>
              </tr>
            </thead>
            <tbody>
              {CONTACTS.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                          {c.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-[11px] capitalize ${STATUS_CLASSES[c.status]}`}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {c.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
