import apiClient from "@/lib/api";
import type { ApiResponse, PaginatedResponse, PaginationMeta } from "@/types/api";
import type {
  SellTemplate,
  SellDeliveryLog,
  SellDeliveryLogDetail,
  SellSuppression,
  SellAnalyticsOverview,
  WorkflowBreakdownItem,
  DailyTrendItem,
  ProviderBreakdownItem,
  EngagementTrendItem,
  AddSuppressionPayload,
  SuppressionReason,
  CreateSellTemplatePayload,
  UpdateSellTemplatePayload,
  EnqueueEmailPayload,
  EnqueueEmailResult,
  DeliveryLogFilters,
  ResendResult,
  BulkResendResult,
  ExportResult,
  SellRequestJourney,
  CreateJourneyPayload,
  SendJourneyStepPayload,
  PreviewJourneyDraftPayload,
  SellJourneyAction,
  StaffNotificationsPayload,
  SellOfferEmailLogItem,
  JourneyAnalytics,
} from "@/types/sell";

import type { AttachmentRef } from "@/types/sell";

export type { PaginationMeta };

export interface SellStats {
  total: number;
  byStatus: {
    active: number;
    completed: number;
    cancelled: number;
    offer_declined: number;
    request_declined: number;
    no_customer_action: number;
  };
  byStep: Record<string, number>;
  /** Active journeys currently at each step — for pipeline/kanban view. */
  byCurrentStep: Record<string, number>;
  totalRevenue: number;
  acceptanceRate: number;
  /** Journeys with offerGeneration greater than 1 (at least one revised offer round). */
  revisedOfferJourneys: number;
  /** Sum of extra offer-ready emails workspace-wide (max(0, offerGeneration - 1) per journey). */
  totalRevisedOfferEmails: number;
  /** Journeys completed after sending device-reship email. */
  journeysClosedByReship: number;
  /** Active journeys where customer hasn't acknowledged request-received in 24h. */
  reminderDueCount: number;
  recentJourneys: import("@/types/sell").SellRequestJourney[];
  recentActions:  import("@/types/sell").SellJourneyAction[];
}

export interface SellEmailPreviewResult {
  html: string;
  subject: string;
  stepKey: string;
}

export interface SendTestEmailPayload {
  workflowKey: string;
  recipientEmail: string;
  subject: string;
  dynamicFieldValues?: Record<string, unknown>;
  attachments?: AttachmentRef[];
  customSignoffName?: string;
  customFooterNote?: string;
  customGreetingText?: string;
  customHeadingColor?: string;
  customBodyTextColor?: string;
  customButtonLabel?: string;
}

export interface SendTestEmailResult {
  messageId: string | null;
  recipient: string;
  workflowKey: string;
}

export const sellRequestService = {
  /** Fetch a guaranteed-unique RKTS ID from the backend without persisting. */
  generateNewId: () =>
    apiClient
      .get<ApiResponse<{ requestId: string }>>("/sell/requests/new-id")
      .then((r) => r.data.data.requestId),
};

export const sellService = {
  // ── Templates ─────────────────────────────────────────────────────────────
  create: (payload: CreateSellTemplatePayload) =>
    apiClient
      .post<ApiResponse<SellTemplate>>("/sell/templates", payload)
      .then((r) => r.data.data),

  list: (workflowKey?: string) =>
    apiClient
      .get<ApiResponse<SellTemplate[]>>("/sell/templates", {
        params: workflowKey ? { workflowKey } : undefined,
      })
      .then((r) => r.data.data),

  getOne: (id: string) =>
    apiClient
      .get<ApiResponse<SellTemplate>>(`/sell/templates/${id}`)
      .then((r) => r.data.data),

  getLatestByWorkflow: (workflowKey: string) =>
    apiClient
      .get<ApiResponse<SellTemplate | null>>(
        `/sell/templates/workflow/${workflowKey}`
      )
      .then((r) => r.data.data),

  update: (id: string, payload: UpdateSellTemplatePayload) =>
    apiClient
      .patch<ApiResponse<SellTemplate>>(`/sell/templates/${id}`, payload)
      .then((r) => r.data.data),

  publish: (id: string) =>
    apiClient
      .post<ApiResponse<SellTemplate>>(`/sell/templates/${id}/publish`)
      .then((r) => r.data.data),

  duplicate: (id: string) =>
    apiClient
      .post<ApiResponse<SellTemplate>>(`/sell/templates/${id}/duplicate`)
      .then((r) => r.data.data),

  delete: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/sell/templates/${id}`)
      .then((r) => r.data),

  // ── Send test email ───────────────────────────────────────────────────────
  sendTestEmail: (payload: SendTestEmailPayload) =>
    apiClient
      .post<ApiResponse<SendTestEmailResult>>("/sell/send-test", payload)
      .then((r) => r.data.data),

  // ── Enqueue real delivery ─────────────────────────────────────────────────
  sendToCustomer: (payload: EnqueueEmailPayload) =>
    apiClient
      .post<ApiResponse<EnqueueEmailResult>>("/sell/send", payload)
      .then((r) => r.data.data),

  // ── Delivery logs ─────────────────────────────────────────────────────────
  getDeliveryLogs: (filters?: DeliveryLogFilters) =>
    apiClient
      .get<PaginatedResponse<SellDeliveryLog>>("/sell/delivery-logs", {
        params: filters,
      })
      .then((r) => r.data),

  getDeliveryLog: (id: string) =>
    apiClient
      .get<ApiResponse<SellDeliveryLog>>(`/sell/delivery-logs/${id}`)
      .then((r) => r.data.data),

  getDeliveryLogDetails: (id: string) =>
    apiClient
      .get<ApiResponse<SellDeliveryLogDetail>>(`/sell/delivery-logs/${id}/details`)
      .then((r) => r.data.data),

  resendOne: (id: string) =>
    apiClient
      .post<ApiResponse<ResendResult>>(`/sell/delivery-logs/${id}/resend`)
      .then((r) => r.data.data),

  resendFailed: (filters?: { workflowKey?: string; provider?: string }) =>
    apiClient
      .post<ApiResponse<BulkResendResult>>("/sell/delivery-logs/resend-failed", filters ?? {})
      .then((r) => r.data.data),

  exportCsv: (filters?: Omit<DeliveryLogFilters, "page" | "limit" | "sortBy" | "sortOrder">) =>
    apiClient
      .get<ApiResponse<ExportResult>>("/sell/delivery-logs/export", {
        params: filters,
      })
      .then((r) => r.data.data),

  // ── Analytics ─────────────────────────────────────────────────────────────
  getAnalyticsOverview: () =>
    apiClient
      .get<ApiResponse<SellAnalyticsOverview>>("/sell/analytics/overview")
      .then((r) => r.data.data),

  getWorkflowBreakdown: () =>
    apiClient
      .get<ApiResponse<WorkflowBreakdownItem[]>>(
        "/sell/analytics/workflow-breakdown"
      )
      .then((r) => r.data.data),

  getDailyTrend: () =>
    apiClient
      .get<ApiResponse<DailyTrendItem[]>>("/sell/analytics/daily-trend")
      .then((r) => r.data.data),

  getProviderBreakdown: () =>
    apiClient
      .get<ApiResponse<ProviderBreakdownItem[]>>(
        "/sell/analytics/provider-breakdown"
      )
      .then((r) => r.data.data),

  getRecentDeliveries: () =>
    apiClient
      .get<ApiResponse<SellDeliveryLog[]>>("/sell/analytics/recent")
      .then((r) => r.data.data),

  getEngagementTrend: () =>
    apiClient
      .get<ApiResponse<EngagementTrendItem[]>>("/sell/analytics/engagement")
      .then((r) => r.data.data),

  // ── Suppression ────────────────────────────────────────────────────────────
  getSuppressionList: (params?: {
    reason?: SuppressionReason;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    apiClient
      .get<PaginatedResponse<SellSuppression>>("/sell/suppression", { params })
      .then((r) => r.data),

  addSuppression: (payload: AddSuppressionPayload) =>
    apiClient
      .post<ApiResponse<SellSuppression>>("/sell/suppression", payload)
      .then((r) => r.data.data),

  removeSuppression: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/sell/suppression/${id}`)
      .then((r) => r.data),

  // ── Journeys ───────────────────────────────────────────────────────────────
  createJourney: (payload: CreateJourneyPayload) =>
    apiClient
      .post<ApiResponse<SellRequestJourney>>("/sell/journeys", payload)
      .then((r) => r.data.data),

  listJourneys: (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    completedStep?: string;
    revisedOffers?: boolean;
    closedByReship?: boolean;
    reminderDue?: boolean;
    currentStep?: string;
  }) => {
    const { revisedOffers, closedByReship, reminderDue, ...rest } = params ?? {};
    // Backend returns a paginated envelope: { data: [...], meta: { page, limit, total, totalPages } }
    return apiClient
      .get<PaginatedResponse<SellRequestJourney>>("/sell/journeys", {
        params: {
          ...rest,
          ...(revisedOffers ? { revisedOffers: "1" } : {}),
          ...(closedByReship ? { closedByReship: "1" } : {}),
          ...(reminderDue   ? { reminderDue: "1" }   : {}),
        },
      })
      .then((r) => r.data);
  },

  getStats: () =>
    apiClient
      .get<ApiResponse<SellStats>>("/sell/journeys/stats")
      .then((r) => r.data.data),

  getJourneyAnalytics: () =>
    apiClient
      .get<ApiResponse<JourneyAnalytics>>("/sell/journeys/analytics")
      .then((r) => r.data.data),

  addStaffNote: (id: string, text: string) =>
    apiClient
      .post<ApiResponse<unknown>>(`/sell/journeys/${id}/notes`, { text })
      .then((r) => r.data),

  deleteStaffNote: (id: string, index: number) =>
    apiClient
      .delete<ApiResponse<null>>(`/sell/journeys/${id}/notes/${index}`)
      .then((r) => r.data),

  exportJourneysCsv: (params?: { status?: string; search?: string; completedStep?: string }) =>
    apiClient
      .get("/sell/journeys/export", { params, responseType: "blob" })
      .then((r) => {
        const url  = URL.createObjectURL(new Blob([r.data as BlobPart], { type: "text/csv" }));
        const date = new Date().toISOString().slice(0, 10);
        const a    = document.createElement("a");
        a.href = url; a.download = `journeys-${date}.csv`; a.click();
        URL.revokeObjectURL(url);
      }),

  getStaffNotifications: () =>
    apiClient
      .get<ApiResponse<StaffNotificationsPayload>>("/sell/journeys/staff-notifications")
      .then((r) => r.data.data),

  markStaffNotificationsRead: (readThrough?: string) =>
    apiClient
      .post<ApiResponse<{ lastReadAt: string }>>(
        "/sell/journeys/staff-notifications/mark-read",
        readThrough ? { readThrough } : {},
      )
      .then((r) => r.data.data),

  getJourney: (id: string) =>
    apiClient
      .get<ApiResponse<SellRequestJourney>>(`/sell/journeys/${id}`)
      .then((r) => r.data.data),

  getJourneyByRequestId: (requestId: string) =>
    apiClient
      .get<ApiResponse<SellRequestJourney>>(`/sell/journeys/by-request/${requestId}`)
      .then((r) => r.data.data),

  sendNextStep: (id: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/sell/journeys/${id}/send-next`, payload ?? {})
      .then((r) => r.data.data),

  sendJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/sell/journeys/${id}/send-step/${step}`, payload ?? {})
      .then((r) => r.data.data),

  resendJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/sell/journeys/${id}/resend/${step}`, payload ?? {})
      .then((r) => r.data.data),

  previewJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<SellEmailPreviewResult>>(
        `/sell/journeys/${id}/preview/${encodeURIComponent(step)}`,
        payload ?? {},
      )
      .then((r) => r.data.data),

  /** Same HTML pipeline as journey step preview, without a journey id (create modal). */
  previewJourneyDraft: (payload: PreviewJourneyDraftPayload) =>
    apiClient
      .post<ApiResponse<SellEmailPreviewResult>>('/sell/journeys/preview-draft', payload)
      .then((r) => r.data.data),

  getOfferEmailLogs: (journeyId: string) =>
    apiClient
      .get<ApiResponse<{ logs: SellOfferEmailLogItem[] }>>(
        `/sell/journeys/${journeyId}/offer-email-logs`,
      )
      .then((r) => r.data.data),

  previewJourneyDeliveryLog: (journeyId: string, logId: string) =>
    apiClient
      .get<ApiResponse<SellEmailPreviewResult & { deliveryLogId?: string }>>(
        `/sell/journeys/${journeyId}/delivery-log/${logId}/preview`,
      )
      .then((r) => r.data.data),

  deleteJourney: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/sell/journeys/${id}`)
      .then((r) => r.data),

  getJourneyActions: (journeyId: string) =>
    apiClient
      .get<ApiResponse<SellJourneyAction[]>>(`/sell/journeys/${journeyId}/actions`)
      .then((r) => r.data.data),

  cancelJourney: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/sell/journeys/${id}/cancel`)
      .then((r) => r.data),

  declineOffer: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/sell/journeys/${id}/decline-offer`)
      .then((r) => r.data),

  sendDeviceReship: (
    id: string,
    payload: {
      courierName: string;
      trackingNumber: string;
      trackingUrl?: string;
      customMessage?: string;
    },
  ) =>
    apiClient
      .post<ApiResponse<unknown>>(`/sell/journeys/${id}/device-reship`, payload)
      .then((r) => r.data),

  updateJourneyData: (id: string, data: Record<string, unknown>) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/sell/journeys/${id}/data`, data)
      .then((r) => r.data),

  addJourneyAttachment: (
    id: string,
    attachment: { storedFilename: string; originalName: string; mimeType: string; size: number; url: string },
  ) =>
    apiClient
      .post<ApiResponse<unknown>>(`/sell/journeys/${id}/attachments`, attachment)
      .then((r) => r.data),

  removeJourneyAttachment: (id: string, storedFilename: string) =>
    apiClient
      .delete<ApiResponse<unknown>>(`/sell/journeys/${id}/attachments/${encodeURIComponent(storedFilename)}`)
      .then((r) => r.data),
};
