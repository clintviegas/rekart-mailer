"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sellService } from "@/services/sell.service";
import type { StaffNotificationsPayload } from "@/types/sell";

export const staffNotificationsQueryKey = ["sell", "staff-notifications"] as const;

export function useStaffNotificationsQuery(enabled: boolean) {
  return useQuery({
    queryKey: staffNotificationsQueryKey,
    queryFn: () => sellService.getStaffNotifications(),
    enabled,
    refetchInterval: 28_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useMarkStaffNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readThrough?: string) =>
      sellService.markStaffNotificationsRead(readThrough),
    onMutate: async (readThrough?: string) => {
      await queryClient.cancelQueries({ queryKey: staffNotificationsQueryKey });
      const previous = queryClient.getQueryData<StaffNotificationsPayload>(
        staffNotificationsQueryKey,
      );
      if (previous) {
        const throughMs = readThrough
          ? new Date(readThrough).getTime()
          : Date.now();
        const throughIso = readThrough ?? new Date(throughMs).toISOString();
        if (Number.isNaN(throughMs)) return { previous };

        const items = previous.items.map((i) => {
          // "Mark all read" (no readThrough) → mark everything read.
          if (!readThrough) return { ...i, unread: false };
          // Individual click: never flip an already-read item back to unread.
          // Only items that ARE currently unread AND created after the clicked
          // item's timestamp remain unread; the rest become read.
          if (!i.unread) return i;
          const t = new Date(i.createdAt).getTime();
          return {
            ...i,
            unread: !Number.isNaN(t) && t > throughMs,
          };
        });
        const unreadCount = items.filter((i) => i.unread).length;

        queryClient.setQueryData<StaffNotificationsPayload>(
          staffNotificationsQueryKey,
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
        queryClient.setQueryData(staffNotificationsQueryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: staffNotificationsQueryKey });
    },
  });
}
