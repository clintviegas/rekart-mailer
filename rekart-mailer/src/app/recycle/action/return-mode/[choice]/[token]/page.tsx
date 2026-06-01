"use client";

import { useEffect, useState, use } from "react";
import { repairPublicActionService, type ReturnModeData } from "@/services/public-action.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";
import { InlineInfoBadge, InlineWarningBadge } from "@/components/shared/action-header-icon";
import { normalizeRepairPickUpAddress } from "@/lib/repair-service-centres";

function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

const AED_STORE_PARKING_NOTE =
  "Parking: Nearest available in Nesto Meena Bazar if parking RTA parking full";

const DELIVERY_ADDRESS_SAVED = "saved";
const DELIVERY_ADDRESS_OTHER = "other";

export default function RepairReturnModePage({
  params,
}: {
  params: Promise<{ choice: string; token: string }>;
}) {
  const { choice, token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const isCollect = choice === "collect";
  const isCourier = choice === "courier";
  const [data, setData] = useState<ReturnModeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [deliveryChoice, setDeliveryChoice] = useState<
    typeof DELIVERY_ADDRESS_SAVED | typeof DELIVERY_ADDRESS_OTHER
  >(DELIVERY_ADDRESS_SAVED);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isCollect && !isCourier) {
      setError("Invalid return option.");
      return;
    }

    const load = isCollect
      ? repairPublicActionService.returnModeCollectView(token)
      : repairPublicActionService.returnModeCourierView(token);

    load
      .then((r) => {
        setData(r.data);
        setServerMessage(r.message ?? null);
        const savedPickup = r.data.pickupAddress?.trim() ?? "";
        const savedDelivery = r.data.deliveryAddress?.trim() ?? "";
        if (savedDelivery) {
          setDeliveryAddress(savedDelivery);
          setDeliveryChoice(
            savedPickup && savedDelivery === savedPickup
              ? DELIVERY_ADDRESS_SAVED
              : DELIVERY_ADDRESS_OTHER,
          );
        } else if (savedPickup) {
          setDeliveryChoice(DELIVERY_ADDRESS_SAVED);
        } else {
          setDeliveryChoice(DELIVERY_ADDRESS_OTHER);
        }
        if (r.data.alreadyProcessed) setSubmitted(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Request failed");
      });
  }, [token, isCollect, isCourier]);

  async function handleCollectSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await repairPublicActionService.returnModeCollectSubmit(token);
      setData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not confirm collection");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCourierSubmit(e: React.FormEvent) {
    e.preventDefault();
    const savedPickup = data?.pickupAddress?.trim() ?? "";
    const address =
      deliveryChoice === DELIVERY_ADDRESS_SAVED && savedPickup
        ? savedPickup
        : deliveryAddress.trim();
    if (address.length < 5) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await repairPublicActionService.returnModeCourierSubmit(token, address);
      setData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not submit delivery address");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isCollect && !isCourier) {
    return <ErrorCard message="Invalid return option." code="generic" />;
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
  if (!data) return <ErrorCard message="Could not process your choice." code="generic" />;

  const showCollectConfirm = isCollect && !data.alreadyProcessed && !submitted;
  const showCourierForm = isCourier && !data.alreadyProcessed && !submitted;
  const showStoreMap = isCollect && Boolean(data.collectionAddress?.trim());
  const isAedCurrency = data.currency?.trim().toUpperCase() === "AED";
  const title =
    data.alreadyProcessed || submitted
      ? isCollect
        ? "Collection confirmed"
        : "Courier delivery confirmed"
      : isCollect
        ? "Collect from our store"
        : "Courier delivery";

  const savedPickupAddress = data.pickupAddress?.trim() ?? "";
  const courierUsesSaved =
    deliveryChoice === DELIVERY_ADDRESS_SAVED && savedPickupAddress.length > 0;
  const courierAddressOk = courierUsesSaved || deliveryAddress.trim().length >= 5;

  return (
    <ActionShell icon={isCollect ? "🏪" : "📦"} title={title} subtitle={`Reference #${data.requestId}`}>
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
        {!data.alreadyProcessed && !submitted && isCollect
          ? "confirm that you will pick up your device from our store."
          : null}
        {!data.alreadyProcessed && !submitted && isCourier
          ? "choose where we should send your repaired device."
          : null}
        {(data.alreadyProcessed || submitted) && isCollect
          ? "we've recorded your choice to collect from our store. Our team will follow up with any pickup details."
          : null}
        {(data.alreadyProcessed || submitted) && isCourier
          ? "we've recorded your courier delivery request. Our team will dispatch your device and share tracking details."
          : null}
      </p>
      <div className="mb-4 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white px-4 py-3">
        <InfoRow label="Request ID" value={`#${data.requestId}`} />
        {data.deviceName ? <InfoRow label="Device" value={data.deviceName} /> : null}
        {data.readyDate ? <InfoRow label="Ready on" value={data.readyDate} /> : null}
        {isCollect && data.collectionAddress ? (
          <InfoRow label="Pick up address" value={normalizeRepairPickUpAddress(data.collectionAddress)} />
        ) : null}
        {isCollect && data.collectionHours ? (
          <InfoRow label="Collection hours" value={data.collectionHours} />
        ) : null}
        {(data.alreadyProcessed || submitted) && data.returnMode ? (
          <InfoRow
            label="Your choice"
            value={data.returnMode === "courier" ? "Courier delivery" : "Collect from store"}
          />
        ) : null}
        {(data.alreadyProcessed || submitted) && data.deliveryAddress ? (
          <InfoRow label="Delivery address" value={data.deliveryAddress} />
        ) : null}
      </div>

      {showStoreMap ? (
        <div className="mb-4">
          <a
            href={googleMapsSearchUrl(data.collectionAddress!)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
          >
            <span aria-hidden>📍</span>
            Open in Google Maps
          </a>
          {isAedCurrency ? (
            <p className="mt-2.5 text-xs leading-relaxed text-slate-500">{AED_STORE_PARKING_NOTE}</p>
          ) : null}
        </div>
      ) : null}

      {showCollectConfirm ? (
        <button
          type="button"
          disabled={submitting}
          onClick={handleCollectSubmit}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {submitting ? "Confirming…" : "Confirm store collection"}
        </button>
      ) : null}

      {showCourierForm ? (
        <form onSubmit={handleCourierSubmit} className="space-y-3">
          {savedPickupAddress ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Delivery address</label>
              <select
                value={deliveryChoice}
                onChange={(e) =>
                  setDeliveryChoice(
                    e.target.value as typeof DELIVERY_ADDRESS_SAVED | typeof DELIVERY_ADDRESS_OTHER,
                  )
                }
                className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none ring-emerald-500/30 focus:ring-2"
              >
                <option value={DELIVERY_ADDRESS_SAVED}>Same as pickup address</option>
                <option value={DELIVERY_ADDRESS_OTHER}>Other address</option>
              </select>
              {courierUsesSaved ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
                  {savedPickupAddress}
                </div>
              ) : (
                <textarea
                  required
                  minLength={5}
                  rows={4}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Full address including city and postal code"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-emerald-500/30 focus:ring-2"
                />
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Delivery address</label>
              <textarea
                required
                minLength={5}
                rows={4}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Full address including city and postal code"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-emerald-500/30 focus:ring-2"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !courierAddressOk}
            className="w-full rounded-xl bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Confirm courier delivery"}
          </button>
        </form>
      ) : null}
    </ActionShell>
  );
}
