"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { repairService } from "@/services/repair.service";
import type { StaffNotificationsPayload } from "@/types/repair";

export const repairStaffNotificationsQueryKey = ["repair", "staff-notifications"] as const;

export function useRepairStaffNotificationsQuery(enabled: boolean) {
  return useQuery({
    queryKey: repairStaffNotificationsQueryKey,
    queryFn: () => repairService.getStaffNotifications(),
    enabled,
    refetchInterval: 28_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useMarkRepairStaffNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readThrough?: string) =>
      repairService.markStaffNotificationsRead(readThrough),
    onMutate: async (readThrough?: string) => {
      await queryClient.cancelQueries({ queryKey: repairStaffNotificationsQueryKey });
      const previous = queryClient.getQueryData<StaffNotificationsPayload>(
        repairStaffNotificationsQueryKey,
      );
      if (previous) {
        const throughMs = readThrough
          ? new Date(readThrough).getTime()
          : Date.now();
        const throughIso = readThrough ?? new Date(throughMs).toISOString();
        if (Number.isNaN(throughMs)) return { previous };

        const items = previous.items.map((i) => {
          if (!readThrough) return { ...i, unread: false };
          if (!i.unread) return i;
          const t = new Date(i.createdAt).getTime();
          return {
            ...i,
            unread: !Number.isNaN(t) && t > throughMs,
          };
        });
        const unreadCount = items.filter((i) => i.unread).length;

        queryClient.setQueryData<StaffNotificationsPayload>(
          repairStaffNotificationsQueryKey,
          {
            ...previous,
            lastReadAt: throughIso,
            items,
            unreadCount,
          },
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(repairStaffNotificationsQueryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: repairStaffNotificationsQueryKey });
    },
  });
}
