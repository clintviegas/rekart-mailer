import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignsService, type CreateCampaignPayload } from "@/services/campaigns.service";
import { QUERY_KEYS } from "@/constants";
import { toast } from "sonner";

export function useCampaigns(page = 1, limit = 20) {
  return useQuery({
    queryKey: [...QUERY_KEYS.CAMPAIGNS, page, limit],
    queryFn: () => campaignsService.getAll(page, limit),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CAMPAIGN(id),
    queryFn: () => campaignsService.getById(id),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCampaignPayload) =>
      campaignsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CAMPAIGNS });
      toast.success("Campaign created successfully.");
    },
    onError: () => {
      toast.error("Failed to create campaign.");
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CAMPAIGNS });
      toast.success("Campaign deleted.");
    },
    onError: () => {
      toast.error("Failed to delete campaign.");
    },
  });
}
