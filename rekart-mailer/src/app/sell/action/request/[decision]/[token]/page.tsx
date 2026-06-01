"use client";

import { useEffect, useState, use } from "react";
import {
  publicActionService,
  type RequestReceivedAckData,
} from "@/services/public-action.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "../../../_components/action-shell";
import { InlineInfoBadge, InlineWarningBadge } from "@/components/shared/action-header-icon";
import { formatDateDDMMYY } from "@/lib/date-format";
import {
  REPAIR_PICKUP_TIME_ANY,
  REPAIR_PICKUP_TIME_WINDOW_SELECT_OPTIONS,
  todayIsoYmdLocal,
} from "@/lib/repair-pickup-time-windows";

export default function RequestReceivedAckPage({
  params,
}: {
  params: Promise<{ decision: string; token: string }>;
}) {
  const { decision, token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [data, setData] = useState<RequestReceivedAckData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [preferredPickupDate, setPreferredPickupDate] = useState("");
  const [preferredPickupTimeSlot, setPreferredPickupTimeSlot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isAccept = decision === "accept";
  const minPickupDate = todayIsoYmdLocal();

  useEffect(() => {
    const fn = isAccept
      ? publicActionService.requestAccept
      : publicActionService.requestDecline;
    fn(token)
      .then((r) => {
        setData(r.data);
        setServerMessage(r.message ?? null);
        if (r.data.preferredPickupDate) {
          setPreferredPickupDate(r.data.preferredPickupDate);
        }
        if (r.data.preferredPickupTimeSlot) {
          setPreferredPickupTimeSlot(r.data.preferredPickupTimeSlot);
        }
        if (r.data.alreadyProcessed) setSubmitted(true);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Request failed";
        setError(msg);
      });
  }, [token, isAccept]);

  async function handleAcceptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preferredPickupTimeSlot || !preferredPickupDate) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await publicActionService.requestAcceptSubmit(token, {
        preferredPickupTimeSlot,
        preferredPickupDate,
      });
      setData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not confirm pickup");
    } finally {
      setSubmitting(false);
    }
  }

  if (!data && !error) return <LoadingCard />;
  if (error && !data) {
    const jwtLike = /access token is invalid|jwt|unauthorized/i.test(error);
    return (
      <ErrorCard
        message={error}
        code={jwtLike || /invalid|tampered|bad request/i.test(error) ? "token" : "generic"}
      />
    );
  }
  if (!data) {
    return <ErrorCard message="Could not process your response." code="generic" />;
  }

  const done = data.alreadyProcessed || submitted;
  const timeOptions = data.timeWindowOptions?.length
    ? data.timeWindowOptions
    : [...REPAIR_PICKUP_TIME_WINDOW_SELECT_OPTIONS];

  const title = done
    ? isAccept
      ? "Schedule pickup confirmed"
      : data.alreadyProcessed
        ? "Already updated"
        : "Request declined"
    : isAccept
      ? "Schedule pickup"
      : "Request declined";

  const subtitle = `Reference #${data.requestId}`;

  return (
    <ActionShell icon={isAccept ? "✅" : "📋"} title={title} subtitle={subtitle}>
      {data.alreadyProcessed && serverMessage ? (
        <div className="mb-4">
          <InlineWarningBadge>{serverMessage}</InlineWarningBadge>
        </div>
      ) : null}
      {!data.alreadyProcessed && serverMessage && !submitted ? (
        <div className="mb-4">
          <InlineInfoBadge>{serverMessage}</InlineInfoBadge>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      <p className="mb-4 text-sm leading-relaxed text-slate-600">
        Hi <strong className="text-[#0f172a]">{data.customerName || "there"}</strong>
        {", "}
        {!done && isAccept
          ? "choose your preferred pickup date and time window, then confirm below."
          : null}
        {!done && !isAccept
          ? "we've noted your choice. Our team may follow up if we can help."
          : null}
        {done && isAccept
          ? "thanks — we've recorded your pickup preference. Our team will follow up with pickup details."
          : null}
        {done && !isAccept ? " Here's a quick recap of your request." : ""}
      </p>

      <div className="mb-4 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white px-4 py-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-800/80">
          Your request
        </p>
        <InfoRow label="Request ID" value={`#${data.requestId}`} />
        {data.deviceName ? <InfoRow label="Item" value={data.deviceName} /> : null}
        {done && isAccept && data.preferredPickupDate ? (
          <InfoRow label="Preferred date" value={formatDateDDMMYY(data.preferredPickupDate)} />
        ) : null}
        {done && isAccept && data.preferredPickupTimeSlot ? (
          <InfoRow label="Preferred time" value={data.preferredPickupTimeSlot} />
        ) : null}
        <InfoRow
          label="Your choice"
          value={isAccept ? (done ? "Schedule pickup ✓" : "Schedule pickup") : "Declined"}
        />
      </div>

      {isAccept && !done ? (
        <form onSubmit={handleAcceptSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Preferred pickup date</label>
            <input
              type="date"
              required
              min={minPickupDate}
              value={preferredPickupDate}
              onChange={(e) => setPreferredPickupDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none ring-emerald-500/30 focus:ring-2 [color-scheme:light]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Preferred time window</label>
            <select
              required
              value={preferredPickupTimeSlot}
              onChange={(e) => setPreferredPickupTimeSlot(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none ring-emerald-500/30 focus:ring-2"
            >
              <option value="" disabled>
                Select a time window
              </option>
              {timeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {preferredPickupTimeSlot === REPAIR_PICKUP_TIME_ANY ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Our team will confirm a pickup time that works for you.
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={submitting || !preferredPickupTimeSlot || !preferredPickupDate}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Confirming…" : "Confirm schedule pickup"}
          </button>
        </form>
      ) : (
        <div
          className={`rounded-xl border px-4 py-3.5 text-center text-sm font-medium leading-snug ${
            isAccept
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {isAccept
            ? "If anything changes, reply to our email or contact us — we're happy to help."
            : "If you tapped this by mistake or want to continue, reply to our email or contact hello@rekart.ae."}
        </div>
      )}
    </ActionShell>
  );
}
