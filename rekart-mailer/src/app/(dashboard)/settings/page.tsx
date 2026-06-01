"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  User, CreditCard, Users, Key, Plug, Palette, ArrowRight,
} from "lucide-react";

type Tab = "Profile" | "Billing" | "Team" | "API Keys" | "Integrations";

const TAB_ICONS: Record<Tab, React.ElementType> = {
  Profile:      User,
  Billing:      CreditCard,
  Team:         Users,
  "API Keys":   Key,
  Integrations: Plug,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Profile");
  const router = useRouter();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <PageHeader title="Settings" description="Manage your account and workspace settings." />
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left nav */}
        <nav className="w-52 shrink-0 space-y-1 border-r border-border px-3 py-4">
          {/* Email Design redirect card */}
          <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
            <p className="text-[10px] font-semibold text-primary mb-1 uppercase tracking-wider">Email Design</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
              Branding, colors, typography & footer are now under SELL.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-6 w-full gap-1 text-[11px] border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => router.push("/dashboard/sell/design")}
            >
              <Palette className="size-3" />
              Open Email Design
              <ArrowRight className="size-3 ml-auto" />
            </Button>
          </div>

          <Separator className="mb-2" />

          {(["Profile", "Billing", "Team", "API Keys", "Integrations"] as Tab[]).map((item) => {
            const Icon = TAB_ICONS[item];
            return (
              <button
                key={item}
                onClick={() => setActiveTab(item)}
                className={cn(
                  "flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  activeTab === item
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="size-4 shrink-0" />
                  {item}
                </span>
                {item === "Billing" && (
                  <Badge className="text-[10px] bg-primary/10 text-primary">Pro</Badge>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {activeTab === "Profile" ? <ProfilePanel /> : <PlaceholderPanel tab={activeTab} />}
        </div>

      </div>
    </div>
  );
}

// ── Profile Panel ─────────────────────────────────────────────────────────────
function ProfilePanel() {
  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Profile Information</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Update your personal details</p>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" defaultValue="Demo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" defaultValue="User" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" defaultValue="demo@example.com" />
        </div>
        <div className="flex justify-end">
          <Button size="sm">Save changes</Button>
        </div>
      </div>
    </div>
  );
}

// ── Placeholder Panel ─────────────────────────────────────────────────────────
function PlaceholderPanel({ tab }: { tab: Tab }) {
  return (
    <div className="flex h-60 items-center justify-center rounded-xl border border-border bg-card">
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{tab}</p>
        <p className="mt-1 text-xs text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}
