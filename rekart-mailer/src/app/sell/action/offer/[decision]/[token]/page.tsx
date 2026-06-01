"use client";

import { useEffect, useState, use } from "react";
import { publicActionService, type OfferData } from "@/services/public-action.service";
import { formatDisplayMoneyOrNull } from "@/lib/format-display-money";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "../../../_components/action-shell";

export default function OfferPage({
  params,
}: {
  params: Promise<{ decision: string; token: string }>;
}) {
  const { decision, token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [data, setData]         = useState<OfferData | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const isAccept = decision === "accept";

  useEffect(() => {
    const fn = isAccept ? publicActionService.offerAccept : publicActionService.offerDecline;
    fn(token)
      .then((r) => {
        setData(r.data);
        setServerMessage(r.message ?? null);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Request failed";
        setError(msg);
      });
  }, [token, isAccept]);

  if (!data && !error) return <LoadingCard />;
  if (error) {
    const jwtLike = /access token is invalid|jwt|unauthorized/i.test(error);
    return (
      <ErrorCard
        message={error}
        code={jwtLike || /invalid|tampered|bad request/i.test(error) ? "token" : "generic"}
      />
    );
  }
  if (!data) return <ErrorCard message="Could not process your decision." code="generic" />;

  const formattedOffer = formatDisplayMoneyOrNull(data.offerAmount, data.currency);
  const title = data.alreadyProcessed
    ? isAccept
      ? "Already recorded"
      : "Already updated"
    : isAccept
      ? "Offer accepted"
      : "Offer declined";

  const subtitle = data.alreadyProcessed && serverMessage
    ? serverMessage
    : `Reference #${data.requestId}`;

  return (
    <ActionShell
      icon={isAccept ? "✅" : "📋"}
      title={title}
      subtitle={subtitle}
    >
      {data.alreadyProcessed && serverMessage ? (
        <div className="mb-4 rotate-0 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
          {serverMessage}
        </div>
      ) : null}

      <p className="mb-4 text-sm leading-relaxed text-slate-600">
        Hi <strong className="text-[#0f172a]">{data.customerName || "there"}</strong>
        {", "}
        {!data.alreadyProcessed &&
          (isAccept
            ? "thanks — your acceptance is confirmed. Our team will move forward with the next steps."
            : "we’ve noted your decision. Our team may reach out with other options.")}
        {data.alreadyProcessed ? " Here’s a quick recap of your request details." : ""}
      </p>

      <div className="mb-4 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white px-4 py-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-800/80">
          Your request
        </p>
        <InfoRow label="Request ID" value={`#${data.requestId}`} />
        {data.deviceName ? <InfoRow label="Item" value={data.deviceName} /> : null}
        {formattedOffer ? <InfoRow label="Offer amount" value={formattedOffer} /> : null}
        <InfoRow label="Your choice" value={isAccept ? "Accepted ✓" : "Declined"} />
      </div>

      <div
        className={`rounded-xl border px-4 py-3.5 text-center text-sm font-medium leading-snug ${
          isAccept
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
      >
        {isAccept
          ? "🎉 Thank you for trusting Rekart. You’ll hear from us shortly on payment and pickup or handover details."
          : "If you change your mind, reply to our email or contact hello@rekart.ae — we’re here to help."}
      </div>
    </ActionShell>
  );
}
