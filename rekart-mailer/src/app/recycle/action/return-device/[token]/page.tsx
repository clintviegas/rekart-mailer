"use client";

import { useEffect, useState, use } from "react";
import { repairPublicActionService, type QuoteData } from "@/services/public-action.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";
import { InlineWarningBadge } from "@/components/shared/action-header-icon";
import { REPAIR_QUOTE_DECLINE_REASONS } from "@/lib/repair-quote-decline-reasons";

export default function RepairReturnDevicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [data, setData] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    repairPublicActionService
      .returnDeviceView(token)
      .then((r) => {
        setData(r.data);
        setServerMessage(r.message ?? null);
        if (r.data.alreadyProcessed) setSubmitted(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Request failed");
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await repairPublicActionService.returnDeviceSubmit(token);
      setData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not submit return request");
    } finally {
      setSubmitting(false);
    }
  }

  if (!data && !error) return <LoadingCard />;
  if (error && !data) {
    return (
      <ErrorCard
        message={error}
        code={/invalid|tampered|token/i.test(error) ? "token" : "generic"}
      />
    );
  }
  if (!data) return <ErrorCard message="Could not process your request." code="generic" />;

  const showForm = !data.alreadyProcessed && !submitted;
  const title = data.alreadyProcessed || submitted ? "Return requested" : "Return my device";

  return (
    <ActionShell icon="📦" title={title} subtitle={`Reference #${data.requestId}`}>
      {(data.alreadyProcessed || submitted) && serverMessage ? (
        <div className="mb-4">
          <InlineWarningBadge>{serverMessage}</InlineWarningBadge>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
          {error}
        </div>
      ) : null}
      <p className="mb-4 text-sm leading-relaxed text-slate-600">
        Hi <strong className="text-[#0f172a]">{data.customerName || "there"}</strong>
        {", "}
        {showForm
          ? "confirm that you want your device returned without proceeding with the repair."
          : "we've recorded your return request. Our team will arrange to send your device back and email you the details."}
      </p>
      <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
        <InfoRow label="Request ID" value={`#${data.requestId}`} />
        {data.deviceName ? <InfoRow label="Device" value={data.deviceName} /> : null}
      </div>
      {showForm ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <InlineWarningBadge>
            Your device will be returned in its current condition. No repair work will be carried out.
          </InlineWarningBadge>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-900 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Confirm — return my device"}
          </button>
        </form>
      ) : null}
    </ActionShell>
  );
}
