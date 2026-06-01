"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { sellRequestService } from "@/services/sell.service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requestIdKey(email: string) {
  return ["sell-request-id", email.toLowerCase().trim()] as const;
}

/**
 * Returns a backend-generated unique RKTS{5-digit} request ID.
 *
 * Rules:
 *  - One unique ID per recipient email. Same email → same cached ID.
 *  - Different email → new ID fetched automatically.
 *  - If `existingId` is provided (loaded from saved template), it is used
 *    immediately and no network call is made.
 *  - While email is empty / invalid the query is disabled; previously
 *    generated ID is held until a valid new email is confirmed.
 */
export function useSellRequestId(
  recipientEmail: string,
  existingId?: string | null,
) {
  const qc = useQueryClient();
  const prevEmailRef = useRef<string>("");

  const normalEmail = recipientEmail.toLowerCase().trim();
  const isValidEmail = EMAIL_RE.test(normalEmail);
  const useExisting = Boolean(existingId);

  // When email changes to a *new* valid address, clear the previous cached ID
  // from globalValues so the form gets the fresh one injected.
  useEffect(() => {
    if (
      isValidEmail &&
      normalEmail !== prevEmailRef.current &&
      prevEmailRef.current !== ""
    ) {
      // Pre-seed the cache check so the new fetch starts immediately
      qc.invalidateQueries({ queryKey: requestIdKey(normalEmail) });
    }
    if (isValidEmail) prevEmailRef.current = normalEmail;
  }, [isValidEmail, normalEmail, qc]);

  const query = useQuery({
    queryKey: requestIdKey(normalEmail),
    queryFn: () => sellRequestService.generateNewId(),
    enabled: isValidEmail && !useExisting,
    // ID must never change once assigned to this email in the current session
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
