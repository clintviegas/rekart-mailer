import apiClient from "@/lib/api";
import type { ApiResponse, PaginatedResponse, PaginationMeta } from "@/types/api";
import type {
  RecycleTemplate,
  RecycleDeliveryLog,
  RecycleDeliveryLogDetail,
  RecycleSuppression,
  RecycleAnalyticsOverview,
  WorkflowBreakdownItem,
  DailyTrendItem,
  ProviderBreakdownItem,
  EngagementTrendItem,
  AddSuppressionPayload,
  SuppressionReason,
  CreateRecycleTemplatePayload,
  UpdateRecycleTemplatePayload,
  EnqueueEmailPayload,
  EnqueueEmailResult,
  DeliveryLogFilters,
  ResendResult,
  BulkResendResult,
  ExportResult,
  RecycleRequestJourney,
  CreateJourneyPayload,
  SendJourneyStepPayload,
  PreviewJourneyDraftPayload,
  RecycleJourneyAction,
  StaffNotificationsPayload,
  RecycleQuoteEmailLogItem,
  JourneyAnalytics,
  AttachmentRef,
} from "@/types/recycle";

export type { PaginationMeta };

export interface RecycleStats {
  total: number;
  byStatus: {
    active: number;
    completed: number;
    cancelled: number;
    request_declined?: number;
    quote_declined?: number;
    booking_declined?: number;
    no_customer_action: number;
  };
  byStep: Record<string, number>;
  byCurrentStep: Record<string, number>;
  totalRevenue: number;
  acceptanceRate: number;
  revisedQuoteJourneys: number;
  totalRevisedQuoteEmails: number;
  journeysClosedByReship: number;
  reminderDueCount: number;
  recentJourneys: import("@/types/Recycle").RecycleRequestJourney[];
  recentActions: import("@/types/Recycle").RecycleJourneyAction[];
}

export interface RecycleEmailPreviewResult {
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

export const RecycleRequestService = {
  generateNewId: () =>
    apiClient
      .get<ApiResponse<{ requestId: string }>>("/recycle/requests/new-id")
      .then((r) => r.data.data.requestId),
};

export const recycleService = {
  create: (payload: CreateRecycleTemplatePayload) =>
    apiClient
      .post<ApiResponse<RecycleTemplate>>("/recycle/templates", payload)
      .then((r) => r.data.data),

  list: (workflowKey?: string) =>
    apiClient
      .get<ApiResponse<RecycleTemplate[]>>("/recycle/templates", {
        params: workflowKey ? { workflowKey } : undefined,
      })
      .then((r) => r.data.data),

  getOne: (id: string) =>
    apiClient
      .get<ApiResponse<RecycleTemplate>>(`/recycle/templates/${id}`)
      .then((r) => r.data.data),

  getLatestByWorkflow: (workflowKey: string) =>
    apiClient
      .get<ApiResponse<RecycleTemplate | null>>(
        `/recycle/templates/workflow/${workflowKey}`,
      )
      .then((r) => r.data.data),

  update: (id: string, payload: UpdateRecycleTemplatePayload) =>
    apiClient
      .patch<ApiResponse<RecycleTemplate>>(`/recycle/templates/${id}`, payload)
      .then((r) => r.data.data),

  publish: (id: string) =>
    apiClient
      .post<ApiResponse<RecycleTemplate>>(`/recycle/templates/${id}/publish`)
      .then((r) => r.data.data),

  duplicate: (id: string) =>
    apiClient
      .post<ApiResponse<RecycleTemplate>>(`/recycle/templates/${id}/duplicate`)
      .then((r) => r.data.data),

  delete: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/recycle/templates/${id}`)
      .then((r) => r.data),

  sendTestEmail: (payload: SendTestEmailPayload) =>
    apiClient
      .post<ApiResponse<SendTestEmailResult>>("/recycle/send-test", payload)
      .then((r) => r.data.data),

  sendToCustomer: (payload: EnqueueEmailPayload) =>
    apiClient
      .post<ApiResponse<EnqueueEmailResult>>("/recycle/send", payload)
      .then((r) => r.data.data),

  getDeliveryLogs: (filters?: DeliveryLogFilters) =>
    apiClient
      .get<PaginatedResponse<RecycleDeliveryLog>>("/recycle/delivery-logs", {
        params: filters,
      })
      .then((r) => r.data),

  getDeliveryLog: (id: string) =>
    apiClient
      .get<ApiResponse<RecycleDeliveryLog>>(`/recycle/delivery-logs/${id}`)
      .then((r) => r.data.data),

  getDeliveryLogDetails: (id: string) =>
    apiClient
      .get<ApiResponse<RecycleDeliveryLogDetail>>(`/recycle/delivery-logs/${id}/details`)
      .then((r) => r.data.data),

  resendOne: (id: string) =>
    apiClient
      .post<ApiResponse<ResendResult>>(`/recycle/delivery-logs/${id}/resend`)
      .then((r) => r.data.data),

  resendFailed: (filters?: { workflowKey?: string; provider?: string }) =>
    apiClient
      .post<ApiResponse<BulkResendResult>>("/recycle/delivery-logs/resend-failed", filters ?? {})
      .then((r) => r.data.data),

  exportCsv: (filters?: Omit<DeliveryLogFilters, "page" | "limit" | "sortBy" | "sortOrder">) =>
    apiClient
      .get<ApiResponse<ExportResult>>("/recycle/delivery-logs/export", {
        params: filters,
      })
      .then((r) => r.data.data),

  getAnalyticsOverview: () =>
    apiClient
      .get<ApiResponse<RecycleAnalyticsOverview>>("/recycle/analytics/overview")
      .then((r) => r.data.data),

  getWorkflowBreakdown: () =>
    apiClient
      .get<ApiResponse<WorkflowBreakdownItem[]>>(
        "/recycle/analytics/workflow-breakdown",
      )
      .then((r) => r.data.data),

  getDailyTrend: () =>
    apiClient
      .get<ApiResponse<DailyTrendItem[]>>("/recycle/analytics/daily-trend")
      .then((r) => r.data.data),

  getProviderBreakdown: () =>
    apiClient
      .get<ApiResponse<ProviderBreakdownItem[]>>(
        "/recycle/analytics/provider-breakdown",
      )
      .then((r) => r.data.data),

  getRecentDeliveries: () =>
    apiClient
      .get<ApiResponse<RecycleDeliveryLog[]>>("/recycle/analytics/recent")
      .then((r) => r.data.data),

  getEngagementTrend: () =>
    apiClient
      .get<ApiResponse<EngagementTrendItem[]>>("/recycle/analytics/engagement")
      .then((r) => r.data.data),

  getSuppressionList: (params?: {
    reason?: SuppressionReason;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    apiClient
      .get<PaginatedResponse<RecycleSuppression>>("/recycle/suppression", { params })
      .then((r) => r.data),

  addSuppression: (payload: AddSuppressionPayload) =>
    apiClient
      .post<ApiResponse<RecycleSuppression>>("/recycle/suppression", payload)
      .then((r) => r.data.data),

  removeSuppression: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/recycle/suppression/${id}`)
      .then((r) => r.data),

  createJourney: (payload: CreateJourneyPayload) =>
    apiClient
      .post<ApiResponse<RecycleRequestJourney>>("/recycle/journeys", payload)
      .then((r) => r.data.data),

  listJourneys: (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    completedStep?: string;
    revisedQuotes?: boolean;
    closedByReship?: boolean;
    reminderDue?: boolean;
    currentStep?: string;
  }) => {
    const { revisedQuotes, closedByReship, reminderDue, ...rest } = params ?? {};
    return apiClient
      .get<PaginatedResponse<RecycleRequestJourney>>("/recycle/journeys", {
        params: {
          ...rest,
          ...(revisedQuotes ? { revisedQuotes: "1" } : {}),
          ...(closedByReship ? { closedByReship: "1" } : {}),
          ...(reminderDue ? { reminderDue: "1" } : {}),
        },
      })
      .then((r) => r.data);
  },

  getStats: () =>
    apiClient
      .get<ApiResponse<RecycleStats>>("/recycle/journeys/stats")
      .then((r) => r.data.data),

  getJourneyAnalytics: () =>
    apiClient
      .get<ApiResponse<JourneyAnalytics>>("/recycle/journeys/analytics")
      .then((r) => r.data.data),

  addStaffNote: (id: string, text: string) =>
    apiClient
      .post<ApiResponse<unknown>>(`/recycle/journeys/${id}/notes`, { text })
      .then((r) => r.data),

  deleteStaffNote: (id: string, index: number) =>
    apiClient
      .delete<ApiResponse<null>>(`/recycle/journeys/${id}/notes/${index}`)
      .then((r) => r.data),

  exportJourneysCsv: (params?: { status?: string; search?: string; completedStep?: string }) =>
    apiClient
      .get("/recycle/journeys/export", { params, responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data as BlobPart], { type: "text/csv" }));
        const date = new Date().toISOString().slice(0, 10);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Recycle-journeys-${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }),

  getStaffNotifications: () =>
    apiClient
      .get<ApiResponse<StaffNotificationsPayload>>("/recycle/journeys/staff-notifications")
      .then((r) => r.data.data),

  markStaffNotificationsRead: (readThrough?: string) =>
    apiClient
      .post<ApiResponse<{ lastReadAt: string }>>(
        "/recycle/journeys/staff-notifications/mark-read",
        readThrough ? { readThrough } : {},
      )
      .then((r) => r.data.data),

  getJourney: (id: string) =>
    apiClient
      .get<ApiResponse<RecycleRequestJourney>>(`/recycle/journeys/${id}`)
      .then((r) => r.data.data),

  getJourneyByRequestId: (requestId: string) =>
    apiClient
      .get<ApiResponse<RecycleRequestJourney>>(`/recycle/journeys/by-request/${requestId}`)
      .then((r) => r.data.data),

  sendNextStep: (id: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/recycle/journeys/${id}/send-next`, payload ?? {})
      .then((r) => r.data.data),

  sendJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/recycle/journeys/${id}/send-step/${step}`, payload ?? {})
      .then((r) => r.data.data),

  resendJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/recycle/journeys/${id}/resend/${step}`, payload ?? {})
      .then((r) => r.data.data),

  previewJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<RecycleEmailPreviewResult>>(
        `/recycle/journeys/${id}/preview/${encodeURIComponent(step)}`,
        payload ?? {},
      )
      .then((r) => r.data.data),

  previewJourneyDraft: (payload: PreviewJourneyDraftPayload) =>
    apiClient
      .post<ApiResponse<RecycleEmailPreviewResult>>("/recycle/journeys/preview-draft", payload)
      .then((r) => r.data.data),

  getQuoteEmailLogs: (journeyId: string) =>
    apiClient
      .get<ApiResponse<{ logs: RecycleQuoteEmailLogItem[] }>>(
        `/recycle/journeys/${journeyId}/quote-email-logs`,
      )
      .then((r) => r.data.data),

  previewJourneyDeliveryLog: (journeyId: string, logId: string) =>
    apiClient
      .get<ApiResponse<RecycleEmailPreviewResult & { deliveryLogId?: string }>>(
        `/recycle/journeys/${journeyId}/delivery-log/${logId}/preview`,
      )
      .then((r) => r.data.data),

  deleteJourney: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/recycle/journeys/${id}`)
      .then((r) => r.data),

  getJourneyActions: (journeyId: string) =>
    apiClient
      .get<ApiResponse<RecycleJourneyAction[]>>(`/recycle/journeys/${journeyId}/actions`)
      .then((r) => r.data.data),

  cancelJourney: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/recycle/journeys/${id}/cancel`)
      .then((r) => r.data),

  declineQuote: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/recycle/journeys/${id}/decline-quote`)
      .then((r) => r.data),

  updateJourneyData: (id: string, data: Record<string, unknown>) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/recycle/journeys/${id}/data`, data)
      .then((r) => r.data),

  addJourneyAttachment: (
    id: string,
    attachment: { storedFilename: string; originalName: string; mimeType: string; size: number; url: string },
  ) =>
    apiClient
      .post<ApiResponse<unknown>>(`/recycle/journeys/${id}/attachments`, attachment)
      .then((r) => r.data),

  removeJourneyAttachment: (id: string, storedFilename: string) =>
    apiClient
      .delete<ApiResponse<unknown>>(`/recycle/journeys/${id}/attachments/${encodeURIComponent(storedFilename)}`)
      .then((r) => r.data),
};
