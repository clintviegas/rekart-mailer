"use client";

import { useEffect, useState, use } from "react";
import { repairPublicActionService } from "@/services/public-action.service";
import {
  ActionShell,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";

export default function RepairSupportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [data, setData] = useState<{ requestId: string; customerName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repairPublicActionService
      .support(token)
      .then((r) => setData(r.data))
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (!data && !error) return <LoadingCard />;
  if (error) return <ErrorCard message={error} />;
  if (!data) return <ErrorCard message="Could not load support info." />;

  return (
    <ActionShell icon="💬" title="Contact Support" subtitle={`Request ${data.requestId}`}>
      <p className="text-sm text-slate-600 mb-5">
        Hi <strong>{data.customerName}</strong>, your support request has been logged. Our repair team will contact you shortly.
      </p>

      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-center mb-4">
        <p className="text-violet-800 font-semibold text-sm">Support request recorded ✓</p>
        <p className="text-violet-600 text-xs mt-1">Reference: {data.requestId}</p>
      </div>

      <div className="space-y-3 text-sm text-slate-600">
        <div className="flex items-start gap-3">
          <span className="text-lg">⏱️</span>
          <div>
            <p className="font-semibold text-slate-700">Response Time</p>
            <p className="text-xs text-slate-500">We typically respond within 2–4 business hours.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-lg">📧</span>
          <div>
            <p className="font-semibold text-slate-700">Via Email</p>
            <p className="text-xs text-slate-500">Check your inbox for updates from our team.</p>
          </div>
        </div>
      </div>
    </ActionShell>
  );
}
