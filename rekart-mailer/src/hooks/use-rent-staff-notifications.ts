"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rentService } from "@/services/rent.service";
import type { RentStaffNotificationsPayload } from "@/types/rent";

export const rentStaffNotificationsQueryKey = ["rent", "staff-notifications"] as const;

export function useRentStaffNotificationsQuery(enabled: boolean) {
  return useQuery({
    queryKey: rentStaffNotificationsQueryKey,
    queryFn: () => rentService.getStaffNotifications(),
    enabled,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

export function useMarkRentStaffNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readThrough?: string) =>
      rentService.markStaffNotificationsRead(readThrough),
    onMutate: async (readThrough) => {
      await queryClient.cancelQueries({ queryKey: rentStaffNotificationsQueryKey });
      const previous = queryClient.getQueryData<RentStaffNotificationsPayload>(
        rentStaffNotificationsQueryKey,
      );
      if (previous) {
        const cutoff = readThrough
          ? new Date(readThrough).getTime()
          : Date.now();
        queryClient.setQueryData<RentStaffNotificationsPayload>(
          rentStaffNotificationsQueryKey,
          {
            ...previous,
            unreadCount: 0,
            lastReadAt: new Date(cutoff).toISOString(),
            items: previous.items.map((i) => ({
              ...i,
              unread: new Date(i.createdAt).getTime() > cutoff,
            })),
          },
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(rentStaffNotificationsQueryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: rentStaffNotificationsQueryKey });
    },
  });
}
