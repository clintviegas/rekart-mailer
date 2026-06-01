"use client";

import { useEffect, useState, use } from "react";
import { rentPublicActionService } from "@/services/rent-public-action.service";
import {
  ActionShell,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";

export default function RentDeliveryConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [message, setMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    rentPublicActionService
      .confirmDelivery(token)
      .then((r) => {
        setRequestId(r.data.requestId);
        setMessage(r.message ?? "Delivery selected.");
        setDone(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Request failed");
      });
  }, [token]);

  if (!done && !error) return <LoadingCard />;
  if (error) return <ErrorCard message={error} code="generic" />;

  return (
    <ActionShell
      icon="🚚"
      title="Delivery confirmed"
      subtitle={requestId ? `Reference #${requestId}` : undefined}
    >
      <p className="text-sm leading-relaxed text-slate-600">{message}</p>
      <p className="mt-4 text-xs text-slate-500">
        We will dispatch your rental to your address once the agreement is signed.
      </p>
    </ActionShell>
  );
}
