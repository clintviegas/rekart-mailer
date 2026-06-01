"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  rentPublicActionService,
  type RentAgreementData,
} from "@/services/rent-public-action.service";
import { extractApiError } from "@/services/auth.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";
import { InlineWarningBadge } from "@/components/shared/action-header-icon";
import { RENT_QUOTE_DECLINE_REASONS } from "@/lib/rent-quote-decline-reasons";
import { formatDateDDMMYY } from "@/lib/date-format";
import { RentSignedAgreementDownload } from "@/components/rent/rent-signed-agreement-download";
import { formatDisplayMoneyOrNull } from "@/lib/format-display-money";
import { RentPaymentTermsNotice } from "@/components/rent/rent-payment-terms-notice";

function formatDateLabel(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return formatDateDDMMYY(s) || s;
}

export default function RentAgreementDecisionPage({
  params,
}: {
  params: Promise<{ decision: string; token: string }>;
}) {
  const { decision, token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const isAccept = decision === "accept";

  const [data, setData] = useState<RentAgreementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [declineReasonChoice, setDeclineReasonChoice] = useState("");
  const [declineReasonOther, setDeclineReasonOther] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const load = isAccept
      ? rentPublicActionService.agreementAcceptView(token)
      : rentPublicActionService.agreementDeclineView(token);

    load
      .then((r) => {
        setData(r.data);
        setServerMessage(r.message ?? null);
        if (r.data.alreadyProcessed) setSubmitted(true);
      })
      .catch((e: unknown) => {
        setError(extractApiError(e));
      });
  }, [token, isAccept]);

  function resolvedDeclineReason(): string {
    if (declineReasonChoice === "Other") return declineReasonOther.trim();
    return declineReasonChoice.trim();
  }

  async function handleDeclineSubmit(e: React.FormEvent) {
    e.preventDefault();
    const reason = resolvedDeclineReason();
    if (reason.length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await rentPublicActionService.agreementDeclineSubmit(token, {
        declineReason: reason,
        customerNote: customerNote.trim() || undefined,
      });
      setData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(extractApiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!data && !error) return <LoadingCard />;
  if (error && !data) {
    return (
      <ErrorCard
        message={error}
        code={/invalid|tampered|token|outdated/i.test(error) ? "token" : "generic"}
      />
    );
  }
  if (!data) return <ErrorCard message="Could not process your decision." code="generic" />;

  const formattedTotal = formatDisplayMoneyOrNull(data.rentalAmount, data.currency);
  const formattedDeposit = formatDisplayMoneyOrNull(data.securityDeposit, data.currency);
  const showAcceptForm = isAccept && !data.alreadyProcessed && !submitted;
  const showDeclineForm = !isAccept && !data.alreadyProcessed && !submitted;
  const title =
    data.alreadyProcessed || submitted
      ? isAccept
        ? "Quote accepted & signed"
        : "Quote declined"
      : isAccept
        ? "Review & accept quote"
        : "Decline quote";

  const items = (data.rentalItems ?? []).filter(
    (i) => String(i.name ?? "").trim(),
  );
  const isFinalOffer = data.quoteReviseType === "final_offer";

  return (
    <ActionShell
      icon={isAccept ? "📋" : "✋"}
      title={title}
      subtitle={`Reference #${data.requestId}`}
    >
      {isFinalOffer && showAcceptForm ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
          <strong className="font-semibold">Our best offer.</strong>{" "}
          We cannot reduce the price further. Accept to proceed, or decline below if you do not wish to continue.
        </div>
      ) : null}
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
          ? isFinalOffer
            ? "this is our best price — review the quote below, then sign the agreement electronically, or decline if you do not wish to continue."
            : "review your rental quote below. Continue to open the agreement and sign electronically with today's date."
          : showDeclineForm
            ? isFinalOffer
              ? "please tell us why you are declining — this is our best price and the request will be closed."
              : "please tell us why you are declining — this helps us send a better revised quote if possible."
              : isAccept
              ? "thanks — your acceptance is confirmed. Our team will proceed with your rental."
              : isFinalOffer
                ? "thank you for your feedback. This rental request has been closed."
                : "thank you for your feedback. Our team may follow up with a revised quote."}
      </p>

      <div className="mb-4 rounded-xl border border-sky-100 bg-gradient-to-b from-sky-50/80 to-white px-4 py-3">
        <InfoRow label="Request ID" value={`#${data.requestId}`} />
        {formattedTotal ? <InfoRow label="Quote total" value={formattedTotal} /> : null}
        {formattedDeposit ? <InfoRow label="Security deposit" value={formattedDeposit} /> : null}
        {data.rentalStartDate ? (
          <InfoRow label="Rental start" value={formatDateLabel(data.rentalStartDate)} />
        ) : null}
        {(data.returnDueDate || data.rentalEndDate) ? (
          <InfoRow
            label="Return due"
            value={formatDateLabel(data.returnDueDate || data.rentalEndDate)}
          />
        ) : null}
        {data.fulfillmentMode ? (
          <InfoRow label="Fulfillment" value={data.fulfillmentMode} />
        ) : null}
        {items.length > 0 ? (
          <InfoRow
            label="Items"
            value={items.map((i) => `${i.name} ×${i.qty ?? 1}`).join(", ")}
          />
        ) : null}
        {(data.alreadyProcessed || submitted) && isAccept ? (
          <>
            <InfoRow label="Your choice" value="Accepted & signed ✓" />
            {data.agreementSignerName ? (
              <InfoRow label="Signed by" value={data.agreementSignerName} />
            ) : null}
            {data.agreementSignedDateDisplay ? (
              <InfoRow label="Signed on" value={data.agreementSignedDateDisplay} />
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
            {data.quoteDeclineNote ? (
              <InfoRow label="Your note" value={data.quoteDeclineNote} />
            ) : null}
          </>
        ) : null}
      </div>

      {(formattedDeposit || formattedTotal) && (showAcceptForm || ((data.alreadyProcessed || submitted) && isAccept)) ? (
        <RentPaymentTermsNotice data={data} className="mb-4" />
      ) : null}

      {showAcceptForm ? (
        <div className="space-y-3">
          <Link
            href={`/rent/action/agreement/sign/${encodeURIComponent(token)}`}
            className="block w-full rounded-xl bg-[#398ff7] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#2d7fe0]"
          >
            Open agreement &amp; sign
          </Link>
          <Link
            href={`/rent/action/agreement/decline/${encodeURIComponent(token)}`}
            className="block w-full rounded-xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
          >
            Decline quote
          </Link>
        </div>
      ) : null}

      {(data.alreadyProcessed || submitted) && isAccept ? (
        <RentSignedAgreementDownload data={data} className="mt-4" />
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
              {RENT_QUOTE_DECLINE_REASONS.map((reason) => (
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
          <div>
            <label htmlFor="customer-note" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Additional note <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="customer-note"
              rows={3}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Anything else you want us to know — e.g. budget, dates, items…"
            />
          </div>
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
