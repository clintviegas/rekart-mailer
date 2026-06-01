"use client";

import { useEffect, useState, use } from "react";
import { repairPublicActionService, type QuoteData } from "@/services/public-action.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";
import { InlineInfoBadge, InlineWarningBadge } from "@/components/shared/action-header-icon";
import { formatDisplayMoneyOrNull } from "@/lib/format-display-money";
import { REPAIR_RETURN_PAYMENT_METHODS } from "@/lib/repair-payment-methods";
import { REPAIR_QUOTE_DECLINE_REASONS } from "@/lib/repair-quote-decline-reasons";

export default function RepairQuotePage({
  params,
}: {
  params: Promise<{ decision: string; token: string }>;
}) {
  const { decision, token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [data, setData] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState("");
  const [declineReasonChoice, setDeclineReasonChoice] = useState("");
  const [declineReasonOther, setDeclineReasonOther] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const isAccept = decision === "accept";

  useEffect(() => {
    const load = isAccept
      ? repairPublicActionService.quoteAcceptView(token)
      : repairPublicActionService.quoteDecline(token);

    load
      .then((r) => {
        setData(r.data);
        setServerMessage(r.message ?? null);
        if (r.data.preferredPaymentMethod) {
          setPreferredPaymentMethod(r.data.preferredPaymentMethod);
        }
        if (r.data.alreadyProcessed) setSubmitted(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Request failed");
      });
  }, [token, isAccept]);

  function resolvedDeclineReason(): string {
    if (declineReasonChoice === "Other") return declineReasonOther.trim();
    return declineReasonChoice.trim();
  }

  async function handleAcceptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preferredPaymentMethod) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await repairPublicActionService.quoteAcceptSubmit(token, preferredPaymentMethod);
      setData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not accept quote");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeclineSubmit(e: React.FormEvent) {
    e.preventDefault();
    const reason = resolvedDeclineReason();
    if (reason.length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await repairPublicActionService.quoteDeclineSubmit(token, reason);
      setData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not submit decline");
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
  if (!data) return <ErrorCard message="Could not process your decision." code="generic" />;

  const formattedQuote = formatDisplayMoneyOrNull(data.quoteAmount ?? data.offerAmount, data.currency);
  const showAcceptForm = isAccept && !data.alreadyProcessed && !submitted;
  const showDeclineForm = !isAccept && !data.alreadyProcessed && !submitted;
  const title = data.alreadyProcessed || submitted
    ? isAccept ? "Quote accepted" : "Quote declined"
    : isAccept ? "Accept your quote" : "Decline quote";

  return (
    <ActionShell icon={isAccept ? "✅" : "📋"} title={title} subtitle={`Reference #${data.requestId}`}>
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
        {showAcceptForm
          ? "review your quote below. When you accept, we will start the repair and collect payment when your device is returned."
          : showDeclineForm
            ? "please tell us why you're declining — this helps us send a better revised quote if possible."
            : isAccept
              ? "thanks — your acceptance is confirmed. Our team will begin the repair and collect payment at return."
              : "thank you for your feedback. Our team may follow up with a revised quote."}
      </p>

      <div className="mb-4 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white px-4 py-3">
        <InfoRow label="Request ID" value={`#${data.requestId}`} />
        {data.deviceName ? <InfoRow label="Device" value={data.deviceName} /> : null}
        {formattedQuote ? <InfoRow label="Quote amount" value={formattedQuote} /> : null}
        {(data.alreadyProcessed || submitted) && isAccept ? (
          <>
            <InfoRow label="Your choice" value="Accepted ✓" />
            {(data.preferredPaymentMethod || preferredPaymentMethod) ? (
              <InfoRow
                label="Payment at return"
                value={data.preferredPaymentMethod || preferredPaymentMethod}
              />
            ) : null}
          </>
        ) : (data.alreadyProcessed || submitted) && !isAccept ? (
          <>
            <InfoRow label="Your choice" value="Declined" />
            {(data.quoteDeclineReason || resolvedDeclineReason()) ? (
              <InfoRow
                label="Your reason"
                value={data.quoteDeclineReason || resolvedDeclineReason()}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {showAcceptForm ? (
        <form onSubmit={handleAcceptSubmit} className="space-y-4">
          <InlineInfoBadge>
            Payment is due when we return your device. You can pay a different way at that time if needed — we will confirm in your completion email.
          </InlineInfoBadge>
          <div>
            <label htmlFor="payment-method" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Preferred payment method at return
            </label>
            <select
              id="payment-method"
              required
              value={preferredPaymentMethod}
              onChange={(e) => setPreferredPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="">Select method…</option>
              {REPAIR_RETURN_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting || !preferredPaymentMethod}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Confirming…" : "Accept quote & start repair"}
          </button>
        </form>
      ) : null}

      {showDeclineForm ? (
        <form onSubmit={handleDeclineSubmit} className="space-y-4">
          <div>
            <label htmlFor="decline-reason" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Why are you declining?
            </label>
            <select
              id="decline-reason"
              required
              value={declineReasonChoice}
              onChange={(e) => setDeclineReasonChoice(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
            >
              <option value="">Select a reason…</option>
              {REPAIR_QUOTE_DECLINE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>
          {declineReasonChoice === "Other" ? (
            <div>
              <label htmlFor="decline-other" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Please describe
              </label>
              <textarea
                id="decline-other"
                required
                rows={3}
                value={declineReasonOther}
                onChange={(e) => setDeclineReasonOther(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                placeholder="Tell us briefly…"
              />
            </div>
          ) : null}
          <button
            type="submit"
            disabled={submitting || resolvedDeclineReason().length < 3}
            className="w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit decline"}
          </button>
        </form>
      ) : null}
    </ActionShell>
  );
}
