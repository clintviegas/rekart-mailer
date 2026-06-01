import type { StaffNotificationItem } from "@/types/sell";
import { JOURNEY_STEP_LABELS } from "@/types/sell";

const STORAGE_KEY = "rekart_staff_desktop_notif_done_ids";

function stepLabel(step: string): string {
  return JOURNEY_STEP_LABELS[step as keyof typeof JOURNEY_STEP_LABELS] ?? step;
}

function loadDoneIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.slice(-300) : []);
  } catch {
    return new Set();
  }
}

function saveDoneId(id: string) {
  const s = loadDoneIds();
  s.add(id);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...s].slice(-300)));
}

function notificationTitle(a: StaffNotificationItem): string {
  switch (a.actionType) {
    case "offer_declined":
      return "Offer declined";
    case "request_received_accepted":
      return "Request confirmed";
    case "request_received_declined":
      return "Request confirmation declined";
    case "agreement_signed":
      return "Agreement signed";
    case "offer_accepted":
      return "Offer accepted";
    case "reschedule_requested":
      return "Reschedule requested";
    case "support_requested":
      return "Support requested";
    default:
      return "Sell journey activity";
  }
}

/** Browser desktop notification; returns true if one was shown. */
export function tryShowStaffDesktopNotification(
  item: StaffNotificationItem,
  onActivate: () => void,
): boolean {
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  if (loadDoneIds().has(item._id)) return false;

  const title = notificationTitle(item);
  const body = `${item.customerName} · ${item.requestId} · ${stepLabel(item.step)}`;

  saveDoneId(item._id);

  try {
    const n = new Notification(title, {
      body,
      tag: `rekart-sell-${item._id}`,
      requireInteraction: false,
    });
    n.onclick = () => {
      n.close();
      onActivate();
    };
    return true;
  } catch {
    return false;
  }
}

export function getDesktopNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}
