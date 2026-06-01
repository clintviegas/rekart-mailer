/**
 * Public action API calls — no auth required.
 * These hit /api/v1/sell/public/... endpoints directly.
 */

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function apiErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && "message" in json) {
    const raw = (json as { message: unknown }).message;
    if (Array.isArray(raw)) return raw.map(String).join(", ");
    if (typeof raw === "string") return raw;
  }
  return fallback;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, { cache: "no-store" });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(json, "Request failed"));
  }
  return json as T;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(json, "Request failed"));
  }
  return json as T;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface TrackData {
  requestId: string;
  customerName: string;
  currentStep: string;
  completedSteps: string[];
  currency: string;
}

export interface OfferData {
  requestId: string;
  customerName: string;
  decision: "accept" | "decline";
  offerAmount?: string;
  currency?: string;
  deviceName?: string;
  alreadyProcessed?: boolean;
}

export interface RequestReceivedAckData {
  requestId: string;
  customerName: string;
  decision: "accept" | "decline";
  deviceName?: string;
  preferredPickupTimeSlot?: string;
  preferredPickupDate?: string;
  customerPreferredPickupTimeAny?: boolean;
  timeWindowOptions?: string[];
  alreadyProcessed?: boolean;
}

export interface ReceiptData {
  requestId: string;
  customerName: string;
  currency: string;
  paymentAmount?: string;
  transactionId?: string;
  payoutMethod?: string;
  accountDetails?: string;
  paymentDate?: string;
  deviceName?: string;
}

export interface RescheduleInfo {
  requestId: string;
  customerName: string;
  dynamicData: {
    pickupDate?: string;
    pickupTime?: string;
    pickupAddress?: string;
  };
}

export const publicActionService = {
  track: (token: string) =>
    get<ApiResponse<TrackData>>(`/sell/public/track/${encodeURIComponent(token)}`),

  rescheduleView: (token: string) =>
    get<ApiResponse<RescheduleInfo>>(`/sell/public/reschedule/${encodeURIComponent(token)}`),

  rescheduleSubmit: (token: string, body: { preferredDate?: string; preferredTime?: string; note?: string }) =>
    post<ApiResponse<{ requestId: string }>>(`/sell/public/reschedule/${encodeURIComponent(token)}`, body),

  offerAccept: (token: string) =>
    get<ApiResponse<OfferData>>(`/sell/public/offer/accept/${encodeURIComponent(token)}`),

  offerDecline: (token: string) =>
    get<ApiResponse<OfferData>>(`/sell/public/offer/decline/${encodeURIComponent(token)}`),

  requestAccept: (token: string) =>
    get<ApiResponse<RequestReceivedAckData>>(`/sell/public/request/accept/${encodeURIComponent(token)}`),

  requestAcceptSubmit: (
    token: string,
    body: { preferredPickupTimeSlot: string; preferredPickupDate: string },
  ) =>
    post<ApiResponse<RequestReceivedAckData>>(`/sell/public/request/accept/${encodeURIComponent(token)}`, body),

  requestDecline: (token: string) =>
    get<ApiResponse<RequestReceivedAckData>>(`/sell/public/request/decline/${encodeURIComponent(token)}`),

  receipt: (token: string) =>
    get<ApiResponse<ReceiptData>>(`/sell/public/receipt/${encodeURIComponent(token)}`),

  rateView: (token: string) =>
    get<ApiResponse<{ requestId: string; customerName: string }>>(`/sell/public/rate/${encodeURIComponent(token)}`),

  rateSubmit: (token: string, body: { rating: number; feedback?: string }) =>
    post<ApiResponse<{ requestId: string; rating: number }>>(`/sell/public/rate/${encodeURIComponent(token)}`, body),

  support: (token: string) =>
    get<ApiResponse<{ requestId: string; customerName: string }>>(`/sell/public/support/${encodeURIComponent(token)}`),
};

export interface QuoteData {
  requestId: string;
  customerName: string;
  decision: "accept" | "decline";
  quoteAmount?: string;
  offerAmount?: string;
  currency?: string;
  deviceName?: string;
  preferredPaymentMethod?: string;
  quoteDeclineReason?: string;
  alreadyProcessed?: boolean;
}

export interface BookingAckData {
  requestId: string;
  customerName: string;
  decision: "accept" | "decline";
  deviceName?: string;
  recycleItemsSummary?: string;
  pickupAddress?: string;
  confirmedPickupAddress?: string;
  pickupAddressSameAsRequest?: boolean;
  preferredPickupTimeSlot?: string;
  preferredPickupDate?: string;
  customerPreferredPickupTimeAny?: boolean;
  timeWindowOptions?: string[];
  alreadyProcessed?: boolean;
}

export interface ReturnModeData {
  requestId: string;
  customerName: string;
  currency?: string;
  deviceName?: string;
  readyDate?: string;
  collectionAddress?: string;
  collectionHours?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  returnMode?: "store" | "courier";
  alreadyProcessed?: boolean;
}

export const repairPublicActionService = {
  track: (token: string) =>
    get<ApiResponse<TrackData>>(`/repair/public/track/${encodeURIComponent(token)}`),

  rescheduleView: (token: string) =>
    get<ApiResponse<RescheduleInfo>>(`/repair/public/reschedule/${encodeURIComponent(token)}`),

  rescheduleSubmit: (token: string, body: { preferredDate?: string; preferredTime?: string; note?: string }) =>
    post<ApiResponse<{ requestId: string }>>(`/repair/public/reschedule/${encodeURIComponent(token)}`, body),

  quoteAcceptView: (token: string) =>
    get<ApiResponse<QuoteData>>(`/repair/public/quote/accept/${encodeURIComponent(token)}`),

  quoteAcceptSubmit: (token: string, preferredPaymentMethod: string) =>
    post<ApiResponse<QuoteData>>(`/repair/public/quote/accept/${encodeURIComponent(token)}`, {
      preferredPaymentMethod,
    }),

  quoteDecline: (token: string) =>
    get<ApiResponse<QuoteData>>(`/repair/public/quote/decline/${encodeURIComponent(token)}`),

  quoteDeclineSubmit: (token: string, declineReason: string) =>
    post<ApiResponse<QuoteData>>(`/repair/public/quote/decline/${encodeURIComponent(token)}`, {
      declineReason,
    }),

  returnDeviceView: (token: string) =>
    get<ApiResponse<QuoteData>>(`/repair/public/return-device/${encodeURIComponent(token)}`),

  returnDeviceSubmit: (token: string) =>
    post<ApiResponse<QuoteData>>(`/repair/public/return-device/${encodeURIComponent(token)}`, {}),

  bookingAccept: (token: string) =>
    get<ApiResponse<BookingAckData>>(`/repair/public/booking/accept/${encodeURIComponent(token)}`),

  bookingAcceptSubmit: (
    token: string,
    body: { preferredPickupTimeSlot: string; preferredPickupDate: string },
  ) =>
    post<ApiResponse<BookingAckData>>(`/repair/public/booking/accept/${encodeURIComponent(token)}`, body),

  bookingDecline: (token: string) =>
    get<ApiResponse<BookingAckData>>(`/repair/public/booking/decline/${encodeURIComponent(token)}`),

  returnModeCollectView: (token: string) =>
    get<ApiResponse<ReturnModeData>>(`/repair/public/return-mode/collect/${encodeURIComponent(token)}`),

  returnModeCollectSubmit: (token: string) =>
    post<ApiResponse<ReturnModeData>>(`/repair/public/return-mode/collect/${encodeURIComponent(token)}`, {}),

  returnModeCourierView: (token: string) =>
    get<ApiResponse<ReturnModeData>>(`/repair/public/return-mode/courier/${encodeURIComponent(token)}`),

  returnModeCourierSubmit: (token: string, deliveryAddress: string) =>
    post<ApiResponse<ReturnModeData>>(`/repair/public/return-mode/courier/${encodeURIComponent(token)}`, {
      deliveryAddress,
    }),

  rateView: (token: string) =>
    get<ApiResponse<{ requestId: string; customerName: string }>>(`/repair/public/rate/${encodeURIComponent(token)}`),

  rateSubmit: (token: string, body: { rating: number; feedback?: string }) =>
    post<ApiResponse<{ requestId: string; rating: number }>>(`/repair/public/rate/${encodeURIComponent(token)}`, body),

  support: (token: string) =>
    get<ApiResponse<{ requestId: string; customerName: string }>>(`/repair/public/support/${encodeURIComponent(token)}`),
};

export const recyclePublicActionService = {
  track: (token: string) =>
    get<ApiResponse<TrackData>>(`/recycle/public/track/${encodeURIComponent(token)}`),

  rescheduleView: (token: string) =>
    get<ApiResponse<RescheduleInfo>>(`/recycle/public/reschedule/${encodeURIComponent(token)}`),

  rescheduleSubmit: (token: string, body: { preferredDate?: string; preferredTime?: string; note?: string }) =>
    post<ApiResponse<{ requestId: string }>>(`/recycle/public/reschedule/${encodeURIComponent(token)}`, body),

  bookingAccept: (token: string) =>
    get<ApiResponse<BookingAckData>>(`/recycle/public/booking/accept/${encodeURIComponent(token)}`),

  bookingAcceptSubmit: (
    token: string,
    body: {
      preferredPickupTimeSlot: string;
      preferredPickupDate: string;
      pickupAddressChoice: "same" | "different";
      pickupAddress?: string;
    },
  ) =>
    post<ApiResponse<BookingAckData>>(`/recycle/public/booking/accept/${encodeURIComponent(token)}`, body),

  bookingDecline: (token: string) =>
    get<ApiResponse<BookingAckData>>(`/recycle/public/booking/decline/${encodeURIComponent(token)}`),

  rateView: (token: string) =>
    get<ApiResponse<{ requestId: string; customerName: string }>>(`/recycle/public/rate/${encodeURIComponent(token)}`),

  rateSubmit: (token: string, body: { rating: number; feedback?: string }) =>
    post<ApiResponse<{ requestId: string; rating: number }>>(`/recycle/public/rate/${encodeURIComponent(token)}`, body),

  support: (token: string) =>
    get<ApiResponse<{ requestId: string; customerName: string }>>(`/recycle/public/support/${encodeURIComponent(token)}`),
};
