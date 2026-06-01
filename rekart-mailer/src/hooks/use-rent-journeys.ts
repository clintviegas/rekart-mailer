"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { rentService, type RentStats } from "@/services/rent.service";
import type {
  RentRequestJourney,
  CreateRentJourneyPayload,
  SendRentJourneyStepPayload,
  RentJourneyAnalytics,
  RentAnalyticsOverview,
} from "@/types/rent";

export function useRentStats(): UseQueryResult<RentStats> {
  return useQuery({
    queryKey: ["rent-stats"],
    queryFn: () => rentService.getStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRentAnalytics(): UseQueryResult<RentJourneyAnalytics> {
  return useQuery({
    queryKey: ["rent-journey-analytics"],
    queryFn: () => rentService.getJourneyAnalytics(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useRentEmailAnalytics(): UseQueryResult<RentAnalyticsOverview> {
  return useQuery({
    queryKey: ["rent-email-analytics"],
    queryFn: () => rentService.getAnalyticsOverview(),
    staleTime: 60_000,
  });
}

export function useRentWorkflowBreakdown() {
  return useQuery({
    queryKey: ["rent-workflow-breakdown"],
    queryFn: () => rentService.getWorkflowBreakdown(),
    staleTime: 60_000,
  });
}

export function useRentEmailDailyTrend() {
  return useQuery({
    queryKey: ["rent-email-daily-trend"],
    queryFn: () => rentService.getDailyTrend(),
    staleTime: 60_000,
  });
}

export function useRentEngagementTrend() {
  return useQuery({
    queryKey: ["rent-engagement-trend"],
    queryFn: () => rentService.getEngagementTrend(),
    staleTime: 60_000,
  });
}

export function useRentProviderBreakdown() {
  return useQuery({
    queryKey: ["rent-provider-breakdown"],
    queryFn: () => rentService.getProviderBreakdown(),
    staleTime: 60_000,
  });
}

export const RENT_JOURNEY_KEYS = {
  all: ["rent-journeys"] as const,
  list: (params?: Record<string, unknown>) =>
    [...RENT_JOURNEY_KEYS.all, "list", JSON.stringify(params ?? {})] as const,
  detail: (id: string) => [...RENT_JOURNEY_KEYS.all, "detail", id] as const,
};

function extractMsg(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const r = (err as { response?: { data?: { message?: unknown } } }).response;
    const m = r?.data?.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m[0] ?? "Something went wrong";
  }
  return "Something went wrong";
}

export function useRentJourneys(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  currentStep?: string;
  returnDue?: boolean;
}) {
  return useQuery({
    queryKey: RENT_JOURNEY_KEYS.list(params as Record<string, unknown>),
    queryFn: () => rentService.listJourneys(params),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useRentJourney(
  id: string | null,
): UseQueryResult<RentRequestJourney> {
  return useQuery({
    queryKey: RENT_JOURNEY_KEYS.detail(id ?? ""),
    queryFn: () => rentService.getJourney(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useRentStepEmailLogs(
  journeyId: string | null | undefined,
  stepKey: string | null | undefined,
) {
  return useQuery({
    queryKey: [
      ...RENT_JOURNEY_KEYS.detail(journeyId ?? ""),
      "email-logs",
      stepKey ?? "",
    ],
    queryFn: () => rentService.listStepEmailLogs(journeyId!, stepKey ?? undefined),
    enabled: !!journeyId && !!stepKey,
    staleTime: 30_000,
  });
}

export function useCreateRentJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRentJourneyPayload) =>
      rentService.createJourney(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.all });
      toast.success("Rent request created");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useSendRentJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      step,
      payload,
    }: {
      id: string;
      step: string;
      payload?: SendRentJourneyStepPayload;
    }) => rentService.sendJourneyStep(id, step, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.all });
      toast.success("Step email queued");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useResendRentJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      step,
      payload,
    }: {
      id: string;
      step: string;
      payload?: SendRentJourneyStepPayload;
    }) => rentService.resendJourneyStep(id, step, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.all });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useCancelRentJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rentService.cancelJourney(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.all });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useResumeRentFinalOfferQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rentService.resumeFinalOfferQuote(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.all });
      toast.success("Journey resumed — send final offer only");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useDeclineRentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rentService.declineRequest(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.all });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useSendRentNextStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload?: SendRentJourneyStepPayload;
    }) => rentService.sendNextStep(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.all });
      toast.success("Email queued for next step");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function usePreviewRentJourneyEmail() {
  return useMutation({
    mutationFn: ({
      id,
      step,
      payload,
    }: {
      id: string;
      step: string;
      payload?: SendRentJourneyStepPayload;
    }) => rentService.previewJourneyStep(id, step, payload),
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useUpdateRentJourneyData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      rentService.updateJourneyData(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: RENT_JOURNEY_KEYS.detail(id) });
      toast.success("Saved");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useRentJourneyActions(journeyId: string | undefined) {
  return useQuery({
    queryKey: ["rent-journey-actions", journeyId],
    queryFn: () => rentService.getJourneyActions(journeyId!),
    enabled: !!journeyId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
