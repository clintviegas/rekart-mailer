"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { recycleService, type RecycleStats } from "@/services/recycle.service";
import type {
  RecycleRequestJourney,
  CreateJourneyPayload,
  SendJourneyStepPayload,
  JourneyAnalytics,
} from "@/types/recycle";

export function useRecycleStats(): UseQueryResult<RecycleStats> {
  return useQuery({
    queryKey: ["Recycle-stats"],
    queryFn: () => recycleService.getStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRecycleAnalytics(): UseQueryResult<JourneyAnalytics> {
  return useQuery({
    queryKey: ["Recycle-journey-analytics"],
    queryFn: () => recycleService.getJourneyAnalytics(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function usePreviewJourneyEmail() {
  return useMutation({
    mutationFn: ({
      id,
      step,
      payload,
    }: {
      id: string;
      step: string;
      payload?: SendJourneyStepPayload;
    }) => recycleService.previewJourneyStep(id, step, payload),
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export const RECYCLE_JOURNEY_KEYS = {
  all: ["Recycle-journeys"] as const,
  list: (params?: Record<string, unknown>) =>
    [...RECYCLE_JOURNEY_KEYS.all, "list", JSON.stringify(params ?? {})] as const,
  detail: (id: string) => [...RECYCLE_JOURNEY_KEYS.all, "detail", id] as const,
};

export function useQuoteEmailLogs(journeyId: string | null | undefined) {
  return useQuery({
    queryKey: [...RECYCLE_JOURNEY_KEYS.detail(journeyId ?? ""), "quote-email-logs"],
    queryFn: () => recycleService.getQuoteEmailLogs(journeyId!),
    enabled: !!journeyId,
    staleTime: 10_000,
  });
}

export function useRecycleJourneys(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  completedStep?: string;
  revisedQuotes?: boolean;
  closedByReship?: boolean;
  reminderDue?: boolean;
  currentStep?: string;
}) {
  return useQuery({
    queryKey: RECYCLE_JOURNEY_KEYS.list(params as Record<string, unknown>),
    queryFn: () => recycleService.listJourneys(params),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useRecycleJourney(id: string | null): UseQueryResult<RecycleRequestJourney> {
  return useQuery({
    queryKey: RECYCLE_JOURNEY_KEYS.detail(id ?? ""),
    queryFn: () => recycleService.getJourney(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useCreateRecycleJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateJourneyPayload) => recycleService.createJourney(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.all });
      toast.success("Recycle journey created");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useSendNextRecycleStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: SendJourneyStepPayload }) =>
      recycleService.sendNextStep(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.all });
      toast.success("Email queued for next step");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useSendRecycleJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, step, payload }: { id: string; step: string; payload?: SendJourneyStepPayload }) =>
      recycleService.sendJourneyStep(id, step, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["Recycle-stats"] });
      toast.success("Step email queued");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useResendRecycleJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, step, payload }: { id: string; step: string; payload?: SendJourneyStepPayload }) =>
      recycleService.resendJourneyStep(id, step, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["Recycle-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useDeleteRecycleJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recycleService.deleteJourney(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.all });
      toast.success("Journey deleted");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useCancelRecycleJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recycleService.cancelJourney(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["Recycle-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useDeclineQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recycleService.declineQuote(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["Recycle-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useUpdateRecycleJourneyData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      recycleService.updateJourneyData(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: RECYCLE_JOURNEY_KEYS.detail(id) });
      toast.success("Saved");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useRecycleJourneyActions(journeyId: string | undefined) {
  return useQuery({
    queryKey: ["Recycle-journey-actions", journeyId],
    queryFn: () => recycleService.getJourneyActions(journeyId!),
    enabled: !!journeyId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

function extractMsg(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const r = (err as { response?: { data?: { message?: unknown } } }).response;
    const m = r?.data?.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m[0] ?? "Something went wrong";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
