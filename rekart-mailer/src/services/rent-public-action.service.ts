import apiClient from "@/lib/api";
import type { ApiResponse } from "@/types/api";

export interface RentFulfillmentConfirmData {
  requestId: string;
  customerName: string;
  fulfillmentMode: string;
  alreadyProcessed: boolean;
}

export interface RentTrackData {
  requestId: string;
  customerName: string;
  currentStep: string;
  status: string;
  completedSteps: string[];
  fulfillmentMode: string | null;
  rentalItems: Array<{ name: string; qty: number; rate?: number }>;
  currency: string;
}

export interface RentAgreementSignData {
  requestId: string;
  customerName: string;
  alreadyProcessed: boolean;
}

export interface RentAgreementAcceptSubmitBody {
  signerName: string;
  signatureImage: string;
  signedDate: string;
  consentGiven: boolean;
}

export interface RentAgreementData {
  requestId: string;
  customerName: string;
  currency: string;
  alreadyProcessed: boolean;
  rentalItems: Array<{ name: string; qty: number; rate?: number | string }>;
  rentalAmount: string;
  securityDeposit: string;
  rentalStartDate: string;
  rentalEndDate: string;
  returnDueDate: string;
  fulfillmentMode: string;
  confirmedAddress: string;
  companyName?: string;
  quoteReviseType?: string;
  quoteDeclineReason?: string;
  quoteDeclineNote?: string;
  agreementSignerName?: string;
  agreementSignedDateDisplay?: string;
  agreementSignedAt?: string;
  agreementSignatureImage?: string;
  quoteDiscounts?: string;
}

export interface RentRequestConfirmData {
  requestId: string;
  customerName: string;
  currency: string;
  alreadyProcessed: boolean;
  rentalItems: Array<{ name: string; qty: number; rate?: number }>;
  customerMessage: string;
  customerAddress: string;
  fulfillmentMode: string | null;
  rentalStartDate: string;
  rentalEndDate: string;
  addressMode: "saved" | "different" | "pickup";
  confirmedAddress: string;
  pickupLocations: Array<{ id: string; label: string; address: string }>;
  selectedPickupLocationId: string;
}

export interface RentRequestDeclineData {
  requestId: string;
  customerName: string;
  currency: string;
  alreadyProcessed: boolean;
  rentalItems: Array<{ name: string; qty: number; rate?: number }>;
}

export interface RentRequestConfirmSubmitBody {
  fulfillmentMode: "pickup" | "delivery";
  rentalStartDate: string;
  rentalEndDate: string;
  pickupLocationId?: string;
  addressMode?: "saved" | "different";
  deliveryAddress?: string;
  rentalItems: Array<{ name: string; qty: number }>;
  customerMessage?: string;
}

export const rentPublicActionService = {
  requestConfirmView: (token: string) =>
    apiClient
      .get<ApiResponse<RentRequestConfirmData>>(
        `/rent/public/request/confirm/${encodeURIComponent(token)}`,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  requestConfirmSubmit: (token: string, body: RentRequestConfirmSubmitBody) =>
    apiClient
      .post<ApiResponse<RentRequestConfirmData>>(
        `/rent/public/request/confirm/${encodeURIComponent(token)}`,
        body,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  requestDeclineView: (token: string) =>
    apiClient
      .get<ApiResponse<RentRequestDeclineData>>(
        `/rent/public/request/decline/${encodeURIComponent(token)}`,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  requestDeclineSubmit: (token: string) =>
    apiClient
      .post<ApiResponse<RentRequestDeclineData>>(
        `/rent/public/request/decline/${encodeURIComponent(token)}`,
        {},
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  confirmPickup: (token: string) =>
    apiClient
      .post<ApiResponse<RentFulfillmentConfirmData>>(
        `/rent/public/request/pickup/${encodeURIComponent(token)}`,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  confirmDelivery: (token: string) =>
    apiClient
      .post<ApiResponse<RentFulfillmentConfirmData>>(
        `/rent/public/request/delivery/${encodeURIComponent(token)}`,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  signAgreement: (token: string, body: RentAgreementAcceptSubmitBody) =>
    apiClient
      .post<ApiResponse<RentAgreementData>>(
        `/rent/public/agreement/sign/${encodeURIComponent(token)}`,
        body,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  agreementAcceptView: (token: string) =>
    apiClient
      .get<ApiResponse<RentAgreementData>>(
        `/rent/public/agreement/accept/${encodeURIComponent(token)}`,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  agreementAcceptSubmit: (token: string, body: RentAgreementAcceptSubmitBody) =>
    apiClient
      .post<ApiResponse<RentAgreementData>>(
        `/rent/public/agreement/accept/${encodeURIComponent(token)}`,
        body,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  agreementDeclineView: (token: string) =>
    apiClient
      .get<ApiResponse<RentAgreementData>>(
        `/rent/public/agreement/decline/${encodeURIComponent(token)}`,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  agreementDeclineSubmit: (
    token: string,
    body: { declineReason: string; customerNote?: string },
  ) =>
    apiClient
      .post<ApiResponse<RentAgreementData>>(
        `/rent/public/agreement/decline/${encodeURIComponent(token)}`,
        body,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),

  getTrack: (token: string) =>
    apiClient
      .get<ApiResponse<RentTrackData>>(
        `/rent/public/track/${encodeURIComponent(token)}`,
      )
      .then((r) => ({ data: r.data.data, message: r.data.message as string | undefined })),
};
