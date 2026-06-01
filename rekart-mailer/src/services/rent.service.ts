import apiClient from "@/lib/api";
import type { ApiResponse, PaginatedResponse } from "@/types/api";
import type {
  RentRequestJourney,
  CreateRentJourneyPayload,
  SendRentJourneyStepPayload,
  RentTemplate,
  CreateRentTemplatePayload,
  UpdateRentTemplatePayload,
  RentStats,
  RentJourneyAnalytics,
  RentAnalyticsOverview,
  RentWorkflowBreakdownItem,
  RentDailyTrendItem,
  RentEngagementTrendItem,
  RentStaffNotificationsPayload,
  RentStepEmailLogItem,
  RentJourneyAction,
} from "@/types/rent";

export interface RentEmailPreviewResult {
  html: string;
  subject: string;
  stepKey?: string;
}

export interface PreviewRentJourneyDraftPayload {
  step: string;
  customerName: string;
  currency?: string;
  requestId?: string;
  dynamicData?: Record<string, unknown>;
}

export type { RentStats };

export const rentRequestService = {
  generateNewId: () =>
    apiClient
      .get<ApiResponse<{ requestId: string }>>("/rent/requests/new-id")
      .then((r) => r.data.data.requestId),
};

export const rentService = {
  // ── Templates ─────────────────────────────────────────────────────────────
  createTemplate: (payload: CreateRentTemplatePayload) =>
    apiClient
      .post<ApiResponse<RentTemplate>>("/rent/templates", payload)
      .then((r) => r.data.data),

  listTemplates: (workflowKey?: string) =>
    apiClient
      .get<ApiResponse<RentTemplate[]>>("/rent/templates", {
        params: workflowKey ? { workflowKey } : undefined,
      })
      .then((r) => r.data.data),

  getTemplate: (id: string) =>
    apiClient
      .get<ApiResponse<RentTemplate>>(`/rent/templates/${id}`)
      .then((r) => r.data.data),

  getLatestTemplateByWorkflow: (workflowKey: string) =>
    apiClient
      .get<ApiResponse<RentTemplate | null>>(
        `/rent/templates/workflow/${workflowKey}`,
      )
      .then((r) => r.data.data),

  updateTemplate: (id: string, payload: UpdateRentTemplatePayload) =>
    apiClient
      .patch<ApiResponse<RentTemplate>>(`/rent/templates/${id}`, payload)
      .then((r) => r.data.data),

  publishTemplate: (id: string) =>
    apiClient
      .post<ApiResponse<RentTemplate>>(`/rent/templates/${id}/publish`)
      .then((r) => r.data.data),

  duplicateTemplate: (id: string) =>
    apiClient
      .post<ApiResponse<RentTemplate>>(`/rent/templates/${id}/duplicate`)
      .then((r) => r.data.data),

  deleteTemplate: (id: string) =>
    apiClient
      .delete<ApiResponse<null>>(`/rent/templates/${id}`)
      .then((r) => r.data),

  // ── Journeys ──────────────────────────────────────────────────────────────
  createJourney: (payload: CreateRentJourneyPayload) =>
    apiClient
      .post<ApiResponse<RentRequestJourney>>("/rent/journeys", payload)
      .then((r) => r.data.data),

  listJourneys: (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    currentStep?: string;
    returnDue?: boolean;
  }) =>
    apiClient
      .get<PaginatedResponse<RentRequestJourney>>("/rent/journeys", {
        params,
      })
      .then((r) => r.data),

  getJourney: (id: string) =>
    apiClient
      .get<ApiResponse<RentRequestJourney>>(`/rent/journeys/${id}`)
      .then((r) => r.data.data),

  sendNextStep: (id: string, payload?: SendRentJourneyStepPayload) =>
    apiClient
      .post<ApiResponse<unknown>>(`/rent/journeys/${id}/send-next`, payload ?? {})
      .then((r) => r.data.data),

  sendJourneyStep: (
    id: string,
    step: string,
    payload?: SendRentJourneyStepPayload,
  ) =>
    apiClient
      .post<ApiResponse<unknown>>(
        `/rent/journeys/${id}/send/${step}`,
        payload ?? {},
      )
      .then((r) => r.data.data),

  resendJourneyStep: (
    id: string,
    step: string,
    payload?: SendRentJourneyStepPayload,
  ) =>
    apiClient
      .post<ApiResponse<unknown>>(
        `/rent/journeys/${id}/resend/${step}`,
        payload ?? {},
      )
      .then((r) => r.data.data),

  cancelJourney: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/rent/journeys/${id}/cancel`)
      .then((r) => r.data.data),

  resumeFinalOfferQuote: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/rent/journeys/${id}/resume-final-offer`)
      .then((r) => r.data.data),

  declineRequest: (id: string) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/rent/journeys/${id}/decline-request`)
      .then((r) => r.data.data),

  addStaffNote: (id: string, text: string) =>
    apiClient
      .post<ApiResponse<unknown>>(`/rent/journeys/${id}/notes`, { text })
      .then((r) => r.data.data),

  deleteStaffNote: (id: string, index: number) =>
    apiClient
      .delete<ApiResponse<null>>(`/rent/journeys/${id}/notes/${index}`)
      .then((r) => r.data),

  previewJourneyStep: (
    id: string,
    step: string,
    payload?: SendRentJourneyStepPayload,
  ) =>
    apiClient
      .post<ApiResponse<RentEmailPreviewResult>>(
        `/rent/journeys/${id}/preview/${step}`,
        payload ?? {},
      )
      .then((r) => r.data.data),

  previewJourneyDraft: (payload: PreviewRentJourneyDraftPayload) =>
    apiClient
      .post<ApiResponse<RentEmailPreviewResult>>(
        "/rent/journeys/preview-draft",
        payload,
      )
      .then((r) => r.data.data),

  previewJourneyDeliveryLog: (journeyId: string, logId: string) =>
    apiClient
      .get<ApiResponse<RentEmailPreviewResult & { deliveryLogId?: string }>>(
        `/rent/journeys/${journeyId}/delivery-log/${logId}/preview`,
      )
      .then((r) => r.data.data),

  listStepEmailLogs: (journeyId: string, step?: string) =>
    apiClient
      .get<ApiResponse<{ logs: RentStepEmailLogItem[] }>>(
        `/rent/journeys/${journeyId}/email-logs`,
        { params: step ? { step } : undefined },
      )
      .then((r) => r.data.data),

  getJourneyActions: (journeyId: string) =>
    apiClient
      .get<ApiResponse<RentJourneyAction[]>>(`/rent/journeys/${journeyId}/actions`)
      .then((r) => r.data.data),

  updateJourneyData: (id: string, dynamicData: Record<string, unknown>) =>
    apiClient
      .patch<ApiResponse<unknown>>(`/rent/journeys/${id}/data`, { dynamicData })
      .then((r) => r.data),

  getStats: () =>
    apiClient
      .get<ApiResponse<RentStats>>("/rent/journeys/stats")
      .then((r) => r.data.data),

  getJourneyAnalytics: () =>
    apiClient
      .get<ApiResponse<RentJourneyAnalytics>>("/rent/journeys/analytics")
      .then((r) => r.data.data),

  getStaffNotifications: () =>
    apiClient
      .get<ApiResponse<RentStaffNotificationsPayload>>("/rent/journeys/staff-notifications")
      .then((r) => r.data.data),

  markStaffNotificationsRead: (readThrough?: string) =>
    apiClient
      .post<ApiResponse<{ lastReadAt: string }>>(
        "/rent/journeys/staff-notifications/mark-read",
        readThrough ? { readThrough } : {},
      )
      .then((r) => r.data.data),

  getAnalyticsOverview: () =>
    apiClient
      .get<ApiResponse<RentAnalyticsOverview>>("/rent/analytics/overview")
      .then((r) => r.data.data),

  getWorkflowBreakdown: () =>
    apiClient
      .get<ApiResponse<RentWorkflowBreakdownItem[]>>(
        "/rent/analytics/workflow-breakdown",
      )
      .then((r) => r.data.data),

  getDailyTrend: () =>
    apiClient
      .get<ApiResponse<RentDailyTrendItem[]>>("/rent/analytics/daily-trend")
      .then((r) => r.data.data),

  getEngagementTrend: () =>
    apiClient
      .get<ApiResponse<RentEngagementTrendItem[]>>("/rent/analytics/engagement")
      .then((r) => r.data.data),

  getProviderBreakdown: () =>
    apiClient
      .get<ApiResponse<Array<{ provider: string; sent: number; failed: number }>>>(
        "/rent/analytics/provider-breakdown",
      )
      .then((r) => r.data.data),
};
