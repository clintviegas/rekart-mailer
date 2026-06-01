"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { repairService, type RepairStats } from "@/services/repair.service";
import type {
  RepairRequestJourney,
  CreateJourneyPayload,
  SendJourneyStepPayload,
  JourneyAnalytics,
} from "@/types/repair";

export function useRepairStats(): UseQueryResult<RepairStats> {
  return useQuery({
    queryKey: ["repair-stats"],
    queryFn: () => repairService.getStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRepairAnalytics(): UseQueryResult<JourneyAnalytics> {
  return useQuery({
    queryKey: ["repair-journey-analytics"],
    queryFn: () => repairService.getJourneyAnalytics(),
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
    }) => repairService.previewJourneyStep(id, step, payload),
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export const REPAIR_JOURNEY_KEYS = {
  all: ["repair-journeys"] as const,
  list: (params?: Record<string, unknown>) =>
    [...REPAIR_JOURNEY_KEYS.all, "list", JSON.stringify(params ?? {})] as const,
  detail: (id: string) => [...REPAIR_JOURNEY_KEYS.all, "detail", id] as const,
};

export function useQuoteEmailLogs(journeyId: string | null | undefined) {
  return useQuery({
    queryKey: [...REPAIR_JOURNEY_KEYS.detail(journeyId ?? ""), "quote-email-logs"],
    queryFn: () => repairService.getQuoteEmailLogs(journeyId!),
    enabled: !!journeyId,
    staleTime: 10_000,
  });
}

export function useRepairJourneys(params?: {
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
    queryKey: REPAIR_JOURNEY_KEYS.list(params as Record<string, unknown>),
    queryFn: () => repairService.listJourneys(params),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useRepairJourney(id: string | null): UseQueryResult<RepairRequestJourney> {
  return useQuery({
    queryKey: REPAIR_JOURNEY_KEYS.detail(id ?? ""),
    queryFn: () => repairService.getJourney(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useCreateRepairJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateJourneyPayload) => repairService.createJourney(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.all });
      toast.success("Repair journey created");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useSendNextRepairStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: SendJourneyStepPayload }) =>
      repairService.sendNextStep(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.all });
      toast.success("Email queued for next step");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useSendRepairJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, step, payload }: { id: string; step: string; payload?: SendJourneyStepPayload }) =>
      repairService.sendJourneyStep(id, step, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["repair-stats"] });
      toast.success("Step email queued");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useResendRepairJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, step, payload }: { id: string; step: string; payload?: SendJourneyStepPayload }) =>
      repairService.resendJourneyStep(id, step, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["repair-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useDeleteRepairJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repairService.deleteJourney(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.all });
      toast.success("Journey deleted");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useCancelRepairJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repairService.cancelJourney(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["repair-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useDeclineQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repairService.declineQuote(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["repair-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useUpdateRepairJourneyData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      repairService.updateJourneyData(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: REPAIR_JOURNEY_KEYS.detail(id) });
      toast.success("Saved");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export function useRepairJourneyActions(journeyId: string | undefined) {
  return useQuery({
    queryKey: ["repair-journey-actions", journeyId],
    queryFn: () => repairService.getJourneyActions(journeyId!),
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
