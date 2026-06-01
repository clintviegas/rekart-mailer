"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  useMarkStaffNotificationsRead,
  useStaffNotificationsQuery,
} from "@/hooks/use-staff-notifications";
import { tryShowStaffDesktopNotification } from "@/lib/staff-desktop-notifications";
import { JOURNEY_STEP_LABELS } from "@/types/sell";
import type { StaffNotificationItem } from "@/types/sell";

function stepLabel(step: string): string {
  return JOURNEY_STEP_LABELS[step as keyof typeof JOURNEY_STEP_LABELS] ?? step;
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
  markRead: ReturnType<typeof useMarkStaffNotificationsRead>,
) {
  markRead.mutate(item.createdAt);
  router.push(`/dashboard/sell/${item.journeyId}`);
}

function toastForItem(
  item: StaffNotificationItem,
  router: ReturnType<typeof useRouter>,
  markRead: ReturnType<typeof useMarkStaffNotificationsRead>,
) {
  const description = `${item.customerName} · ${item.requestId} · ${stepLabel(item.step)}`;
  const action = {
    label: "View journey",
    onClick: () => openJourney(item, router, markRead),
  };
  switch (item.actionType) {
    case "offer_declined":
      toast.error("Customer declined the offer", {
        description,
        duration: 14_000,
        action,
      });
      break;
    case "request_received_accepted":
      toast.success("Customer confirmed the sell request", {
        description,
        duration: 10_000,
        action,
      });
      break;
    case "request_received_declined":
      toast.error("Customer declined the request confirmation", {
        description,
        duration: 14_000,
        action,
      });
      break;
    case "offer_accepted":
      toast.success("Customer accepted the offer", {
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

/**
 * In-app toasts + desktop notifications when unread staff alerts increase.
 * Desktop notifications when the tab is in the background (other tab / minimized).
 * "View" / OS notification click marks read through that event and opens the journey.
 */
export function SellStaffActionAlerts() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { data } = useStaffNotificationsQuery(isAuthenticated);
  const markRead = useMarkStaffNotificationsRead();
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
      const shown = tryShowStaffDesktopNotification(item, () => {
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
