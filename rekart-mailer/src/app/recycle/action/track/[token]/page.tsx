"use client";

import { useEffect, useState, use } from "react";
import { recyclePublicActionService, type TrackData } from "@/services/public-action.service";
import {
  ActionShell,
  StatusBadge,
  LoadingCard,
  ErrorCard,
} from "@/app/recycle/action/_components/action-shell";
import { TrackStepIcon } from "@/components/shared/action-header-icon";

const STEP_ORDER = [
  "booking-confirmed",
  "pickup-scheduled",
  "device-received",
  "diagnosing",
  "quote-ready",
  "repair-in-progress",
  "device-ready",
  "device-returned",
];

const STEP_LABELS: Record<string, string> = {
  "booking-confirmed": "Booking Confirmed",
  "pickup-scheduled": "Pickup Scheduled",
  "device-received": "Device Received",
  "diagnosing": "Diagnosing",
  "quote-ready": "Quote Ready",
  "repair-in-progress": "Repair In Progress",
  "device-ready": "Device Ready",
  "device-returned": "Device Returned",
};

const STEP_ICONS: Record<string, string> = {
  "booking-confirmed": "📋",
  "pickup-scheduled": "🚗",
  "device-received": "📦",
  "diagnosing": "🔬",
  "quote-ready": "💰",
  "repair-in-progress": "🔧",
  "device-ready": "✅",
  "device-returned": "🎉",
};

export default function RepairTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    recyclePublicActionService
      .track(token)
      .then((r) => setData(r.data))
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (!data && !error) return <LoadingCard />;
  if (error) return <ErrorCard message={error} />;
  if (!data) return <ErrorCard message="Could not load repair request data." />;

  return (
    <ActionShell icon="📍" title="Track My Repair" subtitle={`Request ${data.requestId}`}>
      <p className="mb-4 text-sm text-slate-600">
        Hi <strong>{data.customerName}</strong>, here&apos;s the current status of your repair request.
      </p>
      <div className="mb-4">
        <StatusBadge step={data.currentStep} />
      </div>
      <div className="space-y-2">
        {STEP_ORDER.map((step) => {
          const done = data.completedSteps.includes(step);
          const current = step === data.currentStep && !done;
          return (
            <div
              key={step}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                done ? "bg-emerald-50 border border-emerald-200" :
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
    </ActionShell>
  );
}
