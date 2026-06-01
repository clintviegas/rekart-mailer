"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  useMarkRepairStaffNotificationsRead,
  useRepairStaffNotificationsQuery,
} from "@/hooks/use-repair-staff-notifications";
import { tryShowStaffDesktopNotification } from "@/lib/staff-desktop-notifications";
import { REPAIR_JOURNEY_STEP_LABELS } from "@/types/repair";
import type { StaffNotificationItem } from "@/types/repair";

function stepLabel(step: string): string {
  return REPAIR_JOURNEY_STEP_LABELS[step as keyof typeof REPAIR_JOURNEY_STEP_LABELS] ?? step;
}

function newestUnread(
  items: StaffNotificationItem[] | undefined,
): StaffNotificationItem | undefined {
  if (!items?.length) return undefined;
  return items.find((i) => i.unread);
}

function openJourney(
  item: StaffNotificationItem,
  router: ReturnType<typeof useRouter>,
  markRead: ReturnType<typeof useMarkRepairStaffNotificationsRead>,
) {
  markRead.mutate(item.createdAt);
  router.push(`/dashboard/repair/${item.journeyId}`);
}

function toastForItem(
  item: StaffNotificationItem,
  router: ReturnType<typeof useRouter>,
  markRead: ReturnType<typeof useMarkRepairStaffNotificationsRead>,
) {
  const description = `${item.customerName} · ${item.requestId} · ${stepLabel(item.step)}`;
  const action = {
    label: "View journey",
    onClick: () => openJourney(item, router, markRead),
  };
  switch (item.actionType) {
    case "offer_declined":
    case "quote_declined":
      toast.error("Customer declined the quote", {
        description,
        duration: 14_000,
        action,
      });
      break;
    case "request_received_accepted":
      toast.success("Customer confirmed the repair booking", {
        description,
        duration: 10_000,
        action,
      });
      break;
    case "request_received_declined":
      toast.error("Customer declined the booking confirmation", {
        description,
        duration: 14_000,
        action,
      });
      break;
    case "offer_accepted":
    case "quote_accepted":
      toast.success("Customer accepted the quote", {
        description,
        duration: 10_000,
        action,
      });
      break;
    case "reschedule_requested":
      toast("Customer requested a reschedule", {
        description,
        duration: 10_000,
        action,
      });
      break;
    case "support_requested":
      toast("Customer asked for support", {
        description,
        duration: 10_000,
        action,
      });
      break;
    default:
      toast("Customer activity", { description, duration: 8_000, action });
  }
}

/** In-app toasts + desktop notifications for repair journey customer actions. */
export function RepairStaffActionAlerts() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { data } = useRepairStaffNotificationsQuery(isAuthenticated);
  const markRead = useMarkRepairStaffNotificationsRead();
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
      });
      if (!shown) {
        toastForItem(item, router, markRead);
      }
      return;
    }

    toastForItem(item, router, markRead);
  }, [data, router, markRead]);

  return null;
}
