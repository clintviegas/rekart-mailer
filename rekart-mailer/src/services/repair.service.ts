import apiClient from "@/lib/api";
import type { ApiResponse, PaginatedResponse, PaginationMeta } from "@/types/api";
import type {
  RepairTemplate,
  RepairDeliveryLog,
  RepairDeliveryLogDetail,
  RepairSuppression,
  RepairAnalyticsOverview,
  WorkflowBreakdownItem,
  DailyTrendItem,
  ProviderBreakdownItem,
  EngagementTrendItem,
  AddSuppressionPayload,
  SuppressionReason,
  CreateRepairTemplatePayload,
  UpdateRepairTemplatePayload,
  EnqueueEmailPayload,
  EnqueueEmailResult,
  DeliveryLogFilters,
  ResendResult,
  BulkResendResult,
  ExportResult,
  RepairRequestJourney,
  CreateJourneyPayload,
  SendJourneyStepPayload,
  PreviewJourneyDraftPayload,
  RepairJourneyAction,
  StaffNotificationsPayload,
  RepairQuoteEmailLogItem,
  JourneyAnalytics,
  AttachmentRef,
} from "@/types/repair";

export type { PaginationMeta };

export interface RepairStats {
  total: number;
  byStatus: {
    active: number;
    completed: number;
    cancelled: number;
    quote_declined: number;
    booking_declined: number;
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
  recentJourneys: import("@/types/repair").RepairRequestJourney[];
  recentActions: import("@/types/repair").RepairJourneyAction[];
}

export interface RepairEmailPreviewResult {
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

export const repairRequestService = {
  generateNewId: () =>
    apiClient
      .get<ApiResponse<{ requestId: string }>>("/repair/requests/new-id")
      .then((r) => r.data.data.requestId),
};

export const repairService = {
  create: (payload: CreateRepairTemplatePayload) =>
    apiClient
      .post<ApiResponse<RepairTemplate>>("/repair/templates", payload)
      .then((r) => r.data.data),

  list: (workflowKey?: string) =>
    apiClient
      .get<ApiResponse<RepairTemplate[]>>("/repair/templates", {
        params: workflowKey ? { workflowKey } : undefined,
      })
      .then((r) => r.data.data),

  getOne: (id: string) =>
    apiClient
      .get<ApiResponse<RepairTemplate>>(`/repair/templates/${id}`)
      .then((r) => r.data.data),

  getLatestByWorkflow: (workflowKey: string) =>
    apiClient
      .get<ApiResponse<RepairTemplate | null>>(
        `/repair/templates/workflow/${workflowKey}`,
      )
      .then((r) => r.data.data),

  update: (id: string, payload: UpdateRepairTemplatePayload) =>
    apiClient
      .patch<ApiResponse<RepairTemplate>>(`/repair/templates/${id}`, payload)
      .then((r) => r.data.data),

  publish: (id: string) =>
    apiClient
      .post<ApiResponse<RepairTemplate>>(`/repair/templates/${id}/publish`)
      .then((r) => r.data.data),

  duplicate: (id: string) =>
    apiClient
      .post<ApiResponse<RepairTemplate>>(`/repair/templates/${id}/duplicate`)
      .then((r) => r.data.data),

  delete: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/repair/templates/${id}`)
      .then((r) => r.data),

  sendTestEmail: (payload: SendTestEmailPayload) =>
    apiClient
      .post<ApiResponse<SendTestEmailResult>>("/repair/send-test", payload)
      .then((r) => r.data.data),

  sendToCustomer: (payload: EnqueueEmailPayload) =>
    apiClient
      .post<ApiResponse<EnqueueEmailResult>>("/repair/send", payload)
      .then((r) => r.data.data),

  getDeliveryLogs: (filters?: DeliveryLogFilters) =>
    apiClient
      .get<PaginatedResponse<RepairDeliveryLog>>("/repair/delivery-logs", {
        params: filters,
      })
      .then((r) => r.data),

  getDeliveryLog: (id: string) =>
    apiClient
      .get<ApiResponse<RepairDeliveryLog>>(`/repair/delivery-logs/${id}`)
      .then((r) => r.data.data),

  getDeliveryLogDetails: (id: string) =>
    apiClient
      .get<ApiResponse<RepairDeliveryLogDetail>>(`/repair/delivery-logs/${id}/details`)
      .then((r) => r.data.data),

  resendOne: (id: string) =>
    apiClient
      .post<ApiResponse<ResendResult>>(`/repair/delivery-logs/${id}/resend`)
      .then((r) => r.data.data),

  resendFailed: (filters?: { workflowKey?: string; provider?: string }) =>
    apiClient
      .post<ApiResponse<BulkResendResult>>("/repair/delivery-logs/resend-failed", filters ?? {})
      .then((r) => r.data.data),

  exportCsv: (filters?: Omit<DeliveryLogFilters, "page" | "limit" | "sortBy" | "sortOrder">) =>
    apiClient
      .get<ApiResponse<ExportResult>>("/repair/delivery-logs/export", {
        params: filters,
      })
      .then((r) => r.data.data),

  getAnalyticsOverview: () =>
    apiClient
      .get<ApiResponse<RepairAnalyticsOverview>>("/repair/analytics/overview")
      .then((r) => r.data.data),

  getWorkflowBreakdown: () =>
    apiClient
      .get<ApiResponse<WorkflowBreakdownItem[]>>(
        "/repair/analytics/workflow-breakdown",
      )
      .then((r) => r.data.data),

  getDailyTrend: () =>
    apiClient
      .get<ApiResponse<DailyTrendItem[]>>("/repair/analytics/daily-trend")
      .then((r) => r.data.data),

  getProviderBreakdown: () =>
    apiClient
      .get<ApiResponse<ProviderBreakdownItem[]>>(
        "/repair/analytics/provider-breakdown",
      )
      .then((r) => r.data.data),

  getRecentDeliveries: () =>
    apiClient
      .get<ApiResponse<RepairDeliveryLog[]>>("/repair/analytics/recent")
      .then((r) => r.data.data),

  getEngagementTrend: () =>
    apiClient
      .get<ApiResponse<EngagementTrendItem[]>>("/repair/analytics/engagement")
      .then((r) => r.data.data),

  getSuppressionList: (params?: {
    reason?: SuppressionReason;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    apiClient
      .get<PaginatedResponse<RepairSuppression>>("/repair/suppression", { params })
      .then((r) => r.data),

  addSuppression: (payload: AddSuppressionPayload) =>
    apiClient
      .post<ApiResponse<RepairSuppression>>("/repair/suppression", payload)
      .then((r) => r.data.data),

  removeSuppression: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/repair/suppression/${id}`)
      .then((r) => r.data),

  createJourney: (payload: CreateJourneyPayload) =>
    apiClient
      .post<ApiResponse<RepairRequestJourney>>("/repair/journeys", payload)
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
      .get<PaginatedResponse<RepairRequestJourney>>("/repair/journeys", {
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
      .get<ApiResponse<RepairStats>>("/repair/journeys/stats")
      .then((r) => r.data.data),

  getJourneyAnalytics: () =>
    apiClient
      .get<ApiResponse<JourneyAnalytics>>("/repair/journeys/analytics")
      .then((r) => r.data.data),

  addStaffNote: (id: string, text: string) =>
    apiClient
      .post<ApiResponse<unknown>>(`/repair/journeys/${id}/notes`, { text })
      .then((r) => r.data),

  deleteStaffNote: (id: string, index: number) =>
    apiClient
      .delete<ApiResponse<null>>(`/repair/journeys/${id}/notes/${index}`)
      .then((r) => r.data),

  exportJourneysCsv: (params?: { status?: string; search?: string; completedStep?: string }) =>
    apiClient
      .get("/repair/journeys/export", { params, responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data as BlobPart], { type: "text/csv" }));
        const date = new Date().toISOString().slice(0, 10);
        const a = document.createElement("a");
        a.href = url;
        a.download = `repair-journeys-${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }),

  getStaffNotifications: () =>
    apiClient
      .get<ApiResponse<StaffNotificationsPayload>>("/repair/journeys/staff-notifications")
      .then((r) => r.data.data),

  markStaffNotificationsRead: (readThrough?: string) =>
    apiClient
      .post<ApiResponse<{ lastReadAt: string }>>(
        "/repair/journeys/staff-notifications/mark-read",
        readThrough ? { readThrough } : {},
      )
      .then((r) => r.data.data),

  getJourney: (id: string) =>
    apiClient
      .get<ApiResponse<RepairRequestJourney>>(`/repair/journeys/${id}`)
      .then((r) => r.data.data),

  getJourneyByRequestId: (requestId: string) =>
    apiClient
      .get<ApiResponse<RepairRequestJourney>>(`/repair/journeys/by-request/${requestId}`)
      .then((r) => r.data.data),

  sendNextStep: (id: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/repair/journeys/${id}/send-next`, payload ?? {})
      .then((r) => r.data.data),

  sendJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/repair/journeys/${id}/send-step/${step}`, payload ?? {})
      .then((r) => r.data.data),

  resendJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/repair/journeys/${id}/resend/${step}`, payload ?? {})
      .then((r) => r.data.data),

  previewJourneyStep: (id: string, step: string, payload?: SendJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<RepairEmailPreviewResult>>(
        `/repair/journeys/${id}/preview/${encodeURIComponent(step)}`,
        payload ?? {},
      )
      .then((r) => r.data.data),

  previewJourneyDraft: (payload: PreviewJourneyDraftPayload) =>
    apiClient
      .post<ApiResponse<RepairEmailPreviewResult>>("/repair/journeys/preview-draft", payload)
      .then((r) => r.data.data),

  getQuoteEmailLogs: (journeyId: string) =>
    apiClient
      .get<ApiResponse<{ logs: RepairQuoteEmailLogItem[] }>>(
        `/repair/journeys/${journeyId}/quote-email-logs`,
      )
      .then((r) => r.data.data),

  previewJourneyDeliveryLog: (journeyId: string, logId: string) =>
    apiClient
      .get<ApiResponse<RepairEmailPreviewResult & { deliveryLogId?: string }>>(
        `/repair/journeys/${journeyId}/delivery-log/${logId}/preview`,
      )
      .then((r) => r.data.data),

  deleteJourney: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/repair/journeys/${id}`)
      .then((r) => r.data),

  getJourneyActions: (journeyId: string) =>
    apiClient
      .get<ApiResponse<RepairJourneyAction[]>>(`/repair/journeys/${journeyId}/actions`)
      .then((r) => r.data.data),

  cancelJourney: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/repair/journeys/${id}/cancel`)
      .then((r) => r.data),

  declineQuote: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/repair/journeys/${id}/decline-quote`)
      .then((r) => r.data),

  updateJourneyData: (id: string, data: Record<string, unknown>) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/repair/journeys/${id}/data`, data)
      .then((r) => r.data),

  addJourneyAttachment: (
    id: string,
    attachment: { storedFilename: string; originalName: string; mimeType: string; size: number; url: string },
  ) =>
    apiClient
      .post<ApiResponse<unknown>>(`/repair/journeys/${id}/attachments`, attachment)
      .then((r) => r.data),

  removeJourneyAttachment: (id: string, storedFilename: string) =>
    apiClient
      .delete<ApiResponse<unknown>>(`/repair/journeys/${id}/attachments/${encodeURIComponent(storedFilename)}`)
      .then((r) => r.data),
};
