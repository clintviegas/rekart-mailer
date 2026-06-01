"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  useMarkStaffNotificationsRead,
  useStaffNotificationsQuery,
} from "@/hooks/use-staff-notifications";
import {
  useMarkRepairStaffNotificationsRead,
  useRepairStaffNotificationsQuery,
} from "@/hooks/use-repair-staff-notifications";
import {
  useMarkRentStaffNotificationsRead,
  useRentStaffNotificationsQuery,
} from "@/hooks/use-rent-staff-notifications";
import {
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
} from "@/lib/staff-desktop-notifications";
import { JOURNEY_STEP_LABELS as SELL_STEP_LABELS } from "@/types/sell";
import { REPAIR_JOURNEY_STEP_LABELS } from "@/types/repair";
import { rentStepLabel } from "@/types/rent";
import type { StaffNotificationItem as SellStaffNotificationItem } from "@/types/sell";
import type { StaffNotificationItem as RepairStaffNotificationItem } from "@/types/repair";
import type { RentStaffNotificationItem } from "@/types/rent";

type ServiceKind = "sell" | "repair" | "rent";

type CombinedNotificationItem = (
  | SellStaffNotificationItem
  | RepairStaffNotificationItem
  | RentStaffNotificationItem
) & {
  service: ServiceKind;
};

function stepLabel(service: ServiceKind, step: string): string {
  if (service === "repair") {
    return REPAIR_JOURNEY_STEP_LABELS[step as keyof typeof REPAIR_JOURNEY_STEP_LABELS] ?? step;
  }
  if (service === "rent") {
    return rentStepLabel(step as never);
  }
  return SELL_STEP_LABELS[step as keyof typeof SELL_STEP_LABELS] ?? step;
}

function itemTitle(a: CombinedNotificationItem): string {
  switch (a.actionType) {
    case "offer_declined":
    case "quote_declined":
      return a.service === "repair" ? "Declined quote" : "Declined offer";
    case "request_received_accepted":
      if (a.service === "rent") return "Confirmed rent request";
      return a.service === "repair" ? "Confirmed booking" : "Confirmed request";
    case "request_received_declined":
      if (a.service === "rent") return "Declined rent request";
      return a.service === "repair" ? "Declined booking email" : "Declined request email";
    case "agreement_signed":
      return "Signed agreement";
    case "offer_accepted":
    case "quote_accepted":
      return a.service === "repair" ? "Accepted quote" : "Accepted offer";
    case "reschedule_requested":
      return "Requested reschedule";
    case "support_requested":
      return "Asked for support";
    default:
      if (a.service === "rent") return "Rent activity";
      return a.service === "repair" ? "Repair activity" : "Sell activity";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function StaffNotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deskPerm, setDeskPerm] = useState(() => getDesktopNotificationPermission());
  const { isAuthenticated } = useAuth();
  const { data: sellData } = useStaffNotificationsQuery(isAuthenticated);
  const { data: repairData } = useRepairStaffNotificationsQuery(isAuthenticated);
  const { data: rentData } = useRentStaffNotificationsQuery(isAuthenticated);
  const markSellRead = useMarkStaffNotificationsRead();
  const markRepairRead = useMarkRepairStaffNotificationsRead();
  const markRentRead = useMarkRentStaffNotificationsRead();

  const items = useMemo(() => {
    const sellItems: CombinedNotificationItem[] = (sellData?.items ?? []).map((i) => ({
      ...i,
      service: "sell" as const,
    }));
    const repairItems: CombinedNotificationItem[] = (repairData?.items ?? []).map((i) => ({
      ...i,
      service: "repair" as const,
    }));
    const rentItems: CombinedNotificationItem[] = (rentData?.items ?? []).map((i) => ({
      ...i,
      service: "rent" as const,
    }));
    return [...sellItems, ...repairItems, ...rentItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [sellData?.items, repairData?.items, rentData?.items]);

  const unread =
    (sellData?.unreadCount ?? 0) +
    (repairData?.unreadCount ?? 0) +
    (rentData?.unreadCount ?? 0);

  useEffect(() => {
    setDeskPerm(getDesktopNotificationPermission());
  }, []);

  useEffect(() => {
    if (open) setDeskPerm(getDesktopNotificationPermission());
  }, [open]);

  function openItem(a: CombinedNotificationItem) {
    if (a.service === "repair") {
      markRepairRead.mutate(a.createdAt);
      router.push(`/dashboard/repair/${a.journeyId}`);
      return;
    }
    if (a.service === "rent") {
      markRentRead.mutate(a.createdAt);
      router.push(`/dashboard/rent/${a.journeyId}`);
      return;
    }
    markSellRead.mutate(a.createdAt);
    router.push(`/dashboard/sell/${a.journeyId}`);
  }

  function markAllRead() {
    markSellRead.mutate(undefined);
    markRepairRead.mutate(undefined);
    markRentRead.mutate(undefined);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative size-8 text-muted-foreground"
            aria-label={
              unread > 0
                ? `Notifications, ${unread} unread`
                : "Notifications"
            }
          />
        }
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full",
              "bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground",
            )}
            aria-hidden
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(100vw-24px,380px)] p-0 shadow-lg">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-bold text-foreground">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              Customer actions from Sell, Repair &amp; Rent journey emails
            </p>
          </div>
          {unread > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[11px] font-semibold"
              disabled={markSellRead.isPending || markRepairRead.isPending || markRentRead.isPending}
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[min(70vh,360px)] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((a) => (
                <li key={`${a.service}:${a._id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      openItem(a);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      a.unread && "bg-primary/5",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        a.unread ? "bg-primary" : "bg-muted-foreground/30",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-foreground">
                        {itemTitle(a)}
                        <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {a.service}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {a.customerName} · {a.requestId}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                        {stepLabel(a.service, a.step)} · {formatTime(a.createdAt)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {deskPerm === "denied" && (
          <p className="border-t border-border px-3 py-2 text-center text-[10px] text-muted-foreground">
            Desktop notifications are blocked in the browser. Enable them in your site settings to
            get alerts on other tabs.
          </p>
        )}

        {deskPerm === "default" && (
          <div className="border-t border-border px-3 py-2.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 w-full text-[11px] font-semibold"
              onClick={async () => {
                const p = await requestDesktopNotificationPermission();
                setDeskPerm(p);
              }}
            >
              Enable desktop notifications
            </Button>
            <p className="mt-1.5 px-0.5 text-center text-[10px] text-muted-foreground leading-snug">
              Get OS alerts when customers act on emails, even on another tab.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
