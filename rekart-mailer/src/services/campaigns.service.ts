import apiClient from "@/lib/api";
import type { ApiResponse, PaginatedResponse } from "@/types/api";

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: "draft" | "scheduled" | "sent" | "paused";
  recipientCount: number;
  openRate?: number;
  clickRate?: number;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignPayload {
  name: string;
  subject: string;
  templateId?: string;
  scheduledAt?: string;
}

export const campaignsService = {
  getAll: async (page = 1, limit = 20) => {
    const { data } = await apiClient.get<PaginatedResponse<Campaign>>(
      `/campaigns?page=${page}&limit=${limit}`
    );
    return data;
  },

  getById: async (id: string) => {
    const { data } = await apiClient.get<ApiResponse<Campaign>>(`/campaigns/${id}`);
    return data.data;
  },

  create: async (payload: CreateCampaignPayload) => {
    const { data } = await apiClient.post<ApiResponse<Campaign>>("/campaigns", payload);
    return data.data;
  },

  update: async (id: string, payload: Partial<CreateCampaignPayload>) => {
    const { data } = await apiClient.patch<ApiResponse<Campaign>>(
      `/campaigns/${id}`,
      payload
    );
    return data.data;
  },

  delete: async (id: string) => {
    await apiClient.delete(`/campaigns/${id}`);
  },

  send: async (id: string) => {
    const { data } = await apiClient.post<ApiResponse<Campaign>>(`/campaigns/${id}/send`);
    return data.data;
  },
};
