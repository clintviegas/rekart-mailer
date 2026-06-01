"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { publicActionService, type TrackData } from "@/services/public-action.service";
import {
  ActionShell,
  InfoRow,
  StatusBadge,
  LoadingCard,
  ErrorCard,
} from "../../_components/action-shell";
import { TrackStepIcon } from "@/components/shared/action-header-icon";

const STEP_ORDER = [
  "request-received",
  "pickup-scheduled",
  "inspection-underway",
  "offer-ready",
  "payment-sent",
  "device-collected",
  "completed",
];

const STEP_LABELS: Record<string, string> = {
  "request-received":    "Request Received",
  "pickup-scheduled":    "Pickup Scheduled",
  "inspection-underway": "Inspection Underway",
  "offer-ready":         "Offer Ready",
  "payment-sent":        "Payment Sent",
  "device-collected":    "Item Collected",
  "completed":           "Completed",
};

const STEP_ICONS: Record<string, string> = {
  "request-received":    "📋",
  "pickup-scheduled":    "🚗",
  "inspection-underway": "🔬",
  "offer-ready":         "💰",
  "payment-sent":        "✅",
  "device-collected":    "📦",
  "completed":           "🎉",
};

export default function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData]   = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicActionService
      .track(token)
      .then((r) => setData(r.data))
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (!data && !error) return <LoadingCard />;
  if (error) return <ErrorCard message={error} />;
  if (!data)  return <ErrorCard message="Could not load request data." />;

  const currentIdx = STEP_ORDER.indexOf(data.currentStep);

  return (
    <ActionShell icon="📍" title="Track My Request" subtitle={`Request ${data.requestId}`}>
      <p className="text-sm text-slate-600 mb-4">
        Hi <strong>{data.customerName}</strong>, here's the current status of your sell request.
      </p>

      <div className="mb-4">
        <StatusBadge step={data.currentStep} />
      </div>

      {/* Step progress */}
      <div className="space-y-2">
        {STEP_ORDER.map((step, idx) => {
          const done    = data.completedSteps.includes(step);
          const current = step === data.currentStep && !done;
          const future  = !done && !current;
          return (
            <div
              key={step}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                done    ? "bg-emerald-50 border border-emerald-200" :
                current ? "bg-violet-50 border border-violet-300 font-semibold" :
                          "bg-slate-50 border border-transparent text-slate-400"
              }`}
            >
              <TrackStepIcon
                variant={done ? "done" : current ? "current" : "pending"}
                icon={STEP_ICONS[step]}
              />
              <span className={done ? "text-emerald-800" : current ? "text-violet-800" : "text-slate-400"}>
                {STEP_LABELS[step]}
              </span>
              {current && (
                <span className="ml-auto text-[10px] font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
                  CURRENT
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 mt-4 text-center">
        {data.completedSteps.length} of {STEP_ORDER.length} steps completed
      </p>
    </ActionShell>
  );
}
