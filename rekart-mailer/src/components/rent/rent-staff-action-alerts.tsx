"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  useMarkRentStaffNotificationsRead,
  useRentStaffNotificationsQuery,
} from "@/hooks/use-rent-staff-notifications";
import { tryShowStaffDesktopNotification } from "@/lib/staff-desktop-notifications";
import { rentStepLabel } from "@/types/rent";
import type { RentStaffNotificationItem } from "@/types/rent";

function newestUnread(
  items: RentStaffNotificationItem[] | undefined,
): RentStaffNotificationItem | undefined {
  if (!items?.length) return undefined;
  return items.find((i) => i.unread);
}

function openJourney(
  item: RentStaffNotificationItem,
  router: ReturnType<typeof useRouter>,
  markRead: ReturnType<typeof useMarkRentStaffNotificationsRead>,
) {
  markRead.mutate(item.createdAt);
  router.push(`/dashboard/rent/${item.journeyId}`);
}

function changeSummary(item: RentStaffNotificationItem): string | undefined {
  const changes = item.metadata?.customerItemChanges as
    | { added?: unknown[]; removed?: unknown[]; qtyChanged?: unknown[] }
    | undefined;
  if (!changes) return undefined;
  const parts: string[] = [];
  if (changes.added?.length) parts.push(`${changes.added.length} added`);
  if (changes.removed?.length) parts.push(`${changes.removed.length} removed`);
  if (changes.qtyChanged?.length) parts.push(`${changes.qtyChanged.length} qty changed`);
  return parts.length ? parts.join(", ") : undefined;
}

function toastForItem(
  item: RentStaffNotificationItem,
  router: ReturnType<typeof useRouter>,
  markRead: ReturnType<typeof useMarkRentStaffNotificationsRead>,
) {
  const itemChanges = changeSummary(item);
  const description = [
    `${item.customerName} · ${item.requestId} · ${rentStepLabel(item.step as never)}`,
    itemChanges,
  ]
    .filter(Boolean)
    .join(" · ");

  const action = {
    label: "View journey",
    onClick: () => openJourney(item, router, markRead),
  };

  switch (item.actionType) {
    case "request_received_accepted":
      toast.success("Customer confirmed the rent request", {
        description,
        duration: 12_000,
        action,
      });
      break;
    case "request_received_declined":
      toast.error("Customer declined the rent request", {
        description,
        duration: 12_000,
        action,
      });
      break;
    case "agreement_signed":
      toast.success("Customer signed the rent agreement", {
        description,
        duration: 10_000,
        action,
      });
      break;
    case "agreement_declined":
      if (item.metadata?.finalOfferClosed === true) {
        toast.error("Final offer declined — request closed", {
          description,
          duration: 14_000,
          action,
        });
        break;
      }
      toast.error("Customer declined the rent quote", {
        description,
        duration: 14_000,
        action,
      });
      break;
    default:
      toast("Rent journey activity", { description, duration: 8_000, action });
  }
}

export function RentStaffActionAlerts() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { data } = useRentStaffNotificationsQuery(isAuthenticated);
  const markRead = useMarkRentStaffNotificationsRead();
  const prevUnread = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const n = data.unreadCount;
    const prev = prevUnread.current;
    prevUnread.current = n;

    if (prev === null) return;
    if (n <= prev) return;

    const item = newestUnread(data.items);
    if (!item) return;

    const hidden = document.visibilityState === "hidden";
    if (hidden) {
      const shown = tryShowStaffDesktopNotification(
        item as Parameters<typeof tryShowStaffDesktopNotification>[0],
        () => {
          window.focus();
          openJourney(item, router, markRead);
        },
      );
      if (!shown) toastForItem(item, router, markRead);
      return;
    }

    toastForItem(item, router, markRead);
  }, [data, router, markRead]);

  return null;
}
