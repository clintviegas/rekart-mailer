"use client";

import { useEffect, useState, use } from "react";
import { recyclePublicActionService, type BookingAckData } from "@/services/public-action.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "@/app/recycle/action/_components/action-shell";
import { InlineInfoBadge, InlineWarningBadge } from "@/components/shared/action-header-icon";
import { formatDateDDMMYY } from "@/lib/date-format";
import {
  REPAIR_PICKUP_TIME_ANY,
  REPAIR_PICKUP_TIME_WINDOW_SELECT_OPTIONS,
  todayIsoYmdLocal,
} from "@/lib/repair-pickup-time-windows";

type PickupAddressChoice = "same" | "different";

export default function RecycleRequestAckPage({
  params,
}: {
  params: Promise<{ decision: string; token: string }>;
}) {
  const { decision, token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const [data, setData] = useState<BookingAckData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [preferredPickupDate, setPreferredPickupDate] = useState("");
  const [preferredPickupTimeSlot, setPreferredPickupTimeSlot] = useState("");
  const [pickupAddressChoice, setPickupAddressChoice] = useState<PickupAddressChoice>("same");
  const [alternatePickupAddress, setAlternatePickupAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const isAccept = decision === "accept";
  const minPickupDate = todayIsoYmdLocal();

  useEffect(() => {
    const fn = isAccept
      ? recyclePublicActionService.bookingAccept
      : recyclePublicActionService.bookingDecline;
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
        if (r.data.pickupAddressSameAsRequest === false) {
          setPickupAddressChoice("different");
          if (r.data.confirmedPickupAddress) {
            setAlternatePickupAddress(r.data.confirmedPickupAddress);
          }
        } else if (!r.data.pickupAddress?.trim()) {
          setPickupAddressChoice("different");
        }
        if (r.data.alreadyProcessed) setSubmitted(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Request failed");
      });
  }, [token, isAccept]);

  const requestPickupAddress = data?.pickupAddress?.trim() ?? "";
  const needsAddressInput =
    pickupAddressChoice === "different" || !requestPickupAddress;
  const addressReady =
    pickupAddressChoice === "same"
      ? requestPickupAddress.length >= 5
      : alternatePickupAddress.trim().length >= 5;

  async function handleAcceptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preferredPickupTimeSlot || !preferredPickupDate || !addressReady) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await recyclePublicActionService.bookingAcceptSubmit(token, {
        preferredPickupTimeSlot,
        preferredPickupDate,
        pickupAddressChoice: needsAddressInput ? "different" : pickupAddressChoice,
        pickupAddress:
          needsAddressInput || pickupAddressChoice === "different"
            ? alternatePickupAddress.trim()
            : undefined,
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
    return (
      <ErrorCard
        message={error}
        code={/invalid|tampered|token/i.test(error) ? "token" : "generic"}
      />
    );
  }
  if (!data) return <ErrorCard message="Could not process your response." code="generic" />;

  const done = data.alreadyProcessed || submitted;
  const timeOptions = data.timeWindowOptions?.length
    ? data.timeWindowOptions
    : [...REPAIR_PICKUP_TIME_WINDOW_SELECT_OPTIONS];

  const displayAddress =
    data.confirmedPickupAddress?.trim() ||
    (data.pickupAddressSameAsRequest !== false ? data.pickupAddress : undefined) ||
    data.pickupAddress;

  const title = done
    ? isAccept
      ? "Schedule pickup confirmed"
      : data.alreadyProcessed
        ? "Already updated"
        : "Request declined"
    : isAccept
      ? "Confirm recycling pickup"
      : "Request declined";

  return (
    <ActionShell icon={isAccept ? "✅" : "📋"} title={title} subtitle={`Reference #${data.requestId}`}>
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
          ? "review your items below, confirm the pickup address, and choose a preferred date and time."
          : null}
        {!done && !isAccept
          ? "we've noted your choice. Our team may follow up if we can help."
          : null}
        {done && isAccept
          ? "thanks — we've recorded your pickup preference. Our team will follow up with pickup details."
          : null}
      </p>
      <div className="mb-4 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white px-4 py-3">
        <InfoRow label="Request ID" value={`#${data.requestId}`} />
        {data.recycleItemsSummary ? (
          <InfoRow label="Items" value={data.recycleItemsSummary} />
        ) : data.deviceName ? (
          <InfoRow label="Items" value={data.deviceName} />
        ) : null}
        {requestPickupAddress && !done ? (
          <InfoRow label="Address on request" value={requestPickupAddress} />
        ) : null}
        {done && isAccept && displayAddress ? (
          <InfoRow label="Pickup address" value={displayAddress} />
        ) : null}
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
          {requestPickupAddress ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Pickup address</p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <input
                  type="radio"
                  name="pickupAddressChoice"
                  checked={pickupAddressChoice === "same"}
                  onChange={() => setPickupAddressChoice("same")}
                  className="mt-0.5"
                />
                <span className="text-sm text-slate-800">
                  <span className="font-medium">Same as request address</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                    {requestPickupAddress}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <input
                  type="radio"
                  name="pickupAddressChoice"
                  checked={pickupAddressChoice === "different"}
                  onChange={() => setPickupAddressChoice("different")}
                  className="mt-0.5"
                />
                <span className="text-sm font-medium text-slate-800">Different address</span>
              </label>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-slate-500">
              No address was saved on this request — please enter where we should collect from.
            </p>
          )}

          {needsAddressInput ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {requestPickupAddress ? "New pickup address" : "Pickup address"}
              </label>
              <textarea
                required
                rows={3}
                value={alternatePickupAddress}
                onChange={(e) => setAlternatePickupAddress(e.target.value)}
                placeholder="Building, street, area, city…"
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none ring-emerald-500/30 focus:ring-2"
              />
            </div>
          ) : null}

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
            disabled={
              submitting ||
              !preferredPickupTimeSlot ||
              !preferredPickupDate ||
              !addressReady
            }
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Confirming…" : "Confirm schedule pickup"}
          </button>
        </form>
      ) : null}
    </ActionShell>
  );
}
