"use client";

import { useEffect, useState, use } from "react";
import { repairPublicActionService, type RescheduleInfo } from "@/services/public-action.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";

export default function RepairReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [info, setInfo] = useState<RescheduleInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSub] = useState(false);
  const [submitted, setSent] = useState(false);

  useEffect(() => {
    repairPublicActionService
      .rescheduleView(token)
      .then((r) => {
        setInfo(r.data);
        setDate(r.data.dynamicData.pickupDate ?? "");
        setTime(r.data.dynamicData.pickupTime ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSub(true);
    try {
      await repairPublicActionService.rescheduleSubmit(token, { preferredDate: date, preferredTime: time, note });
      setSent(true);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSub(false);
    }
  }

  if (!info && !error) return <LoadingCard />;
  if (error) return <ErrorCard message={error} />;
  if (!info) return <ErrorCard message="Could not load request data." />;

  if (submitted) {
    return (
      <ActionShell icon="✅" title="Reschedule Requested" subtitle={`Request ${info.requestId}`}>
        <p className="text-sm text-slate-600 text-center py-4">
          Your reschedule request has been submitted. Our team will confirm the new pickup date shortly.
        </p>
      </ActionShell>
    );
  }

  return (
    <ActionShell icon="🚗" title="Reschedule Pickup" subtitle={`Request ${info.requestId}`}>
      <p className="text-sm text-slate-600 mb-4">
        Hi <strong>{info.customerName}</strong>, request a new pickup date and we&apos;ll confirm shortly.
      </p>

      <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm space-y-1">
        <InfoRow label="Current Date" value={info.dynamicData.pickupDate} />
        <InfoRow label="Current Time" value={info.dynamicData.pickupTime} />
        <InfoRow label="Address" value={info.dynamicData.pickupAddress} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Preferred Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Preferred Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Any specific instructions…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
        >
          {submitting ? "Submitting…" : "Request Reschedule"}
        </button>
      </form>
    </ActionShell>
  );
}
