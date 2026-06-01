"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { repairRequestService } from "@/services/repair.service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requestIdKey(email: string) {
  return ["repair-request-id", email.toLowerCase().trim()] as const;
}

/**
 * Returns a backend-generated unique RKRP{5-digit} request ID.
 */
export function useRepairRequestId(
  recipientEmail: string,
  existingId?: string | null,
) {
  const qc = useQueryClient();
  const prevEmailRef = useRef<string>("");

  const normalEmail = recipientEmail.toLowerCase().trim();
  const isValidEmail = EMAIL_RE.test(normalEmail);
  const useExisting = Boolean(existingId);

  useEffect(() => {
    if (
      isValidEmail &&
      normalEmail !== prevEmailRef.current &&
      prevEmailRef.current !== ""
    ) {
      qc.invalidateQueries({ queryKey: requestIdKey(normalEmail) });
    }
    if (isValidEmail) prevEmailRef.current = normalEmail;
  }, [isValidEmail, normalEmail, qc]);

  const query = useQuery({
    queryKey: requestIdKey(normalEmail),
    queryFn: () => repairRequestService.generateNewId(),
    enabled: isValidEmail && !useExisting,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    requestId: existingId ?? (isValidEmail ? (query.data ?? null) : null),
    isLoading: isValidEmail && !useExisting && query.isLoading,
  };
}
