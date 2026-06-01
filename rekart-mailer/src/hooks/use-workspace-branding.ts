"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceService, type WorkspaceBranding } from "@/services/workspace.service";

export const BRANDING_QUERY_KEY = ["workspace-branding"] as const;

export function useWorkspaceBranding() {
  return useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: workspaceService.getBranding,
    staleTime: 60_000,
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => workspaceService.uploadLogo(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["workspace-current"] });
    },
  });
}

export function useRemoveLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: workspaceService.removeLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["workspace-current"] });
    },
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WorkspaceBranding>) =>
      workspaceService.updateBranding(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
    },
  });
}
