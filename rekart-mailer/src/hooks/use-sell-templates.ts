"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { sellService, type SellStats } from "@/services/sell.service";
import type {
  SellRequestJourney,
  CreateJourneyPayload,
  SendJourneyStepPayload,
  JourneyAnalytics,
} from "@/types/sell";

// ── Stats ──────────────────────────────────────────────────────────────────────
export function useSellStats(): UseQueryResult<SellStats> {
  return useQuery({
    queryKey: ["sell-stats"],
    queryFn: () => sellService.getStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ── Journey analytics ───────────────────────────────────────────────────────────
export function useSellAnalytics(): UseQueryResult<JourneyAnalytics> {
  return useQuery({
    queryKey: ["sell-journey-analytics"],
    queryFn: () => sellService.getJourneyAnalytics(),
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
    }) => sellService.previewJourneyStep(id, step, payload),
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

export const JOURNEY_KEYS = {
  all:    ["sell-journeys"] as const,
  list:   (params?: Record<string, unknown>) =>
    [...JOURNEY_KEYS.all, "list", JSON.stringify(params ?? {})] as const,
  detail: (id: string) => [...JOURNEY_KEYS.all, "detail", id] as const,
};

export function useOfferEmailLogs(journeyId: string | null | undefined) {
  return useQuery({
    queryKey: [...JOURNEY_KEYS.detail(journeyId ?? ""), "offer-email-logs"],
    queryFn: () => sellService.getOfferEmailLogs(journeyId!),
    enabled: !!journeyId,
    staleTime: 10_000,
  });
}

// ── List journeys ──────────────────────────────────────────────────────────────
export function useJourneys(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  completedStep?: string;
  revisedOffers?: boolean;
  closedByReship?: boolean;
  reminderDue?: boolean;
  currentStep?: string;
}) {
  return useQuery({
    queryKey: JOURNEY_KEYS.list(params as Record<string, unknown>),
    queryFn: () => sellService.listJourneys(params),
    staleTime: 15_000,
    // Keep the previous page data visible while a new page/filter is loading
    // — prevents the list from flashing empty on tab switches or search.
    placeholderData: (prev) => prev,
  });
}

// ── Single journey ─────────────────────────────────────────────────────────────
export function useJourney(id: string | null): UseQueryResult<SellRequestJourney> {
  return useQuery({
    queryKey: JOURNEY_KEYS.detail(id ?? ""),
    queryFn: () => sellService.getJourney(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

// ── Create journey ─────────────────────────────────────────────────────────────
export function useCreateJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateJourneyPayload) => sellService.createJourney(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.all });
      toast.success("Journey created");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

// ── Send next step ─────────────────────────────────────────────────────────────
export function useSendNextStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: SendJourneyStepPayload }) =>
      sellService.sendNextStep(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.all });
      toast.success("Email queued for next step");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

// ── Send specific step ─────────────────────────────────────────────────────────
export function useSendJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, step, payload }: { id: string; step: string; payload?: SendJourneyStepPayload }) =>
      sellService.sendJourneyStep(id, step, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["sell-stats"] });
      toast.success("Step email queued");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

// ── Resend step ────────────────────────────────────────────────────────────────
export function useResendJourneyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, step, payload }: { id: string; step: string; payload?: SendJourneyStepPayload }) =>
      sellService.resendJourneyStep(id, step, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["sell-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

/** Send device reship email and complete journey (tracking + courier + optional tracking URL). */
export function useSendDeviceReship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      courierName,
      trackingNumber,
      trackingUrl,
      customMessage,
    }: {
      id: string;
      courierName: string;
      trackingNumber: string;
      trackingUrl?: string;
      customMessage?: string;
    }) =>
      sellService.sendDeviceReship(id, {
        courierName,
        trackingNumber,
        ...(trackingUrl ? { trackingUrl } : {}),
        ...(customMessage ? { customMessage } : {}),
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["sell-stats"] });
      toast.success("Reship email sent — journey completed");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

// ── Delete journey ─────────────────────────────────────────────────────────────
export function useDeleteJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sellService.deleteJourney(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.all });
      toast.success("Journey deleted");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

// ── Cancel journey ─────────────────────────────────────────────────────────────
export function useCancelJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sellService.cancelJourney(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["sell-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

// ── Decline offer (admin) ──────────────────────────────────────────────────────
export function useDeclineOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sellService.declineOffer(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.all });
      qc.invalidateQueries({ queryKey: ["sell-stats"] });
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

// ── Update journey dynamic data ────────────────────────────────────────────────
export function useUpdateJourneyData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      sellService.updateJourneyData(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: JOURNEY_KEYS.detail(id) });
      toast.success("Saved");
    },
    onError: (err: unknown) => toast.error(extractMsg(err)),
  });
}

// ── Customer journey actions timeline ─────────────────────────────────────────
export function useJourneyActions(journeyId: string | undefined) {
  return useQuery({
    queryKey: ["journey-actions", journeyId],
    queryFn: () => sellService.getJourneyActions(journeyId!),
    enabled: !!journeyId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────
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
