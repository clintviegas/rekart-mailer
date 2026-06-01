"use client";

import { useEffect, useState, use } from "react";
import { rentPublicActionService } from "@/services/rent-public-action.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";
import { rentStepLabel } from "@/types/rent";

export default function RentTrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof rentPublicActionService.getTrack>
  >["data"] | null>(null);

  useEffect(() => {
    rentPublicActionService
      .getTrack(token)
      .then((r) => setData(r.data))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Request failed");
      });
  }, [token]);

  if (!data && !error) return <LoadingCard />;
  if (error || !data) return <ErrorCard message={error ?? "Not found"} code="generic" />;

  return (
    <ActionShell
      icon="🔑"
      title="Track your rental"
      subtitle={`Reference #${data.requestId}`}
    >
      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
        <InfoRow label="Status" value={data.status} />
        <InfoRow label="Current step" value={rentStepLabel(data.currentStep)} />
        <InfoRow
          label="Fulfillment"
          value={data.fulfillmentMode ? data.fulfillmentMode : "Pending your choice"}
        />
        <InfoRow label="Currency" value={data.currency} />
      </div>
      {data.rentalItems?.length ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Rental items
          </p>
          <ul className="space-y-1.5">
            {data.rentalItems.map((item, i) => (
              <li key={i} className="rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-700">
                {item.name} × {item.qty}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ActionShell>
  );
}
