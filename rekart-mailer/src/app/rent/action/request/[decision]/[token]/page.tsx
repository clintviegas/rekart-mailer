"use client";

import { useEffect, useState, use } from "react";
import {
  rentPublicActionService,
  type RentRequestConfirmData,
  type RentRequestDeclineData,
} from "@/services/rent-public-action.service";
import { extractApiError } from "@/services/auth.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";
import { InlineInfoBadge, InlineWarningBadge } from "@/components/shared/action-header-icon";
import { formatDateDDMMYY } from "@/lib/date-format";
import { todayIsoYmdLocal } from "@/lib/repair-pickup-time-windows";

interface ItemRow {
  name: string;
  qty: number;
}

export default function RentRequestDecisionPage({
  params,
}: {
  params: Promise<{ decision: string; token: string }>;
}) {
  const { decision, token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);
  const isConfirm = decision === "confirm";

  const [confirmData, setConfirmData] = useState<RentRequestConfirmData | null>(null);
  const [declineData, setDeclineData] = useState<RentRequestDeclineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [fulfillmentMode, setFulfillmentMode] = useState<"pickup" | "delivery">("pickup");
  const [rentalStartDate, setRentalStartDate] = useState("");
  const [rentalEndDate, setRentalEndDate] = useState("");
  const [pickupLocationId, setPickupLocationId] = useState("");
  const [addressMode, setAddressMode] = useState<"saved" | "different">("saved");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  const minDate = todayIsoYmdLocal();

  useEffect(() => {
    const load = isConfirm
      ? rentPublicActionService.requestConfirmView(token)
      : rentPublicActionService.requestDeclineView(token);

    load
      .then((r) => {
        if (isConfirm) {
          const d = r.data as RentRequestConfirmData;
          setConfirmData(d);
          if (d.fulfillmentMode === "delivery" || d.fulfillmentMode === "pickup") {
            setFulfillmentMode(d.fulfillmentMode);
          }
          if (d.rentalStartDate) setRentalStartDate(d.rentalStartDate);
          if (d.rentalEndDate) setRentalEndDate(d.rentalEndDate);
          if (d.selectedPickupLocationId) {
            setPickupLocationId(d.selectedPickupLocationId);
          } else if (d.pickupLocations?.length) {
            setPickupLocationId(d.pickupLocations[0].id);
          }
          if (d.addressMode === "saved" || d.addressMode === "different") {
            setAddressMode(d.addressMode);
          }
          if (d.confirmedAddress && d.addressMode === "different") {
            setDeliveryAddress(d.confirmedAddress);
          }
          if (d.customerMessage) setCustomerMessage(d.customerMessage);
          if (!d.customerAddress?.trim()) setAddressMode("different");
          setItems(
            (d.rentalItems ?? []).length
              ? (d.rentalItems ?? []).map((i) => ({
                  name: String(i.name ?? ""),
                  qty: Number(i.qty) || 1,
                }))
              : [{ name: "", qty: 1 }],
          );
        } else {
          setDeclineData(r.data as RentRequestDeclineData);
        }
        setServerMessage(r.message ?? null);
        if (r.data.alreadyProcessed) setSubmitted(true);
      })
      .catch((e: unknown) => {
        setError(extractApiError(e));
      });
  }, [token, isConfirm]);

  useEffect(() => {
    if (fulfillmentMode !== "pickup") return;
    if (pickupLocationId) return;
    const locations = confirmData?.pickupLocations ?? [];
    if (locations.length > 0) {
      setPickupLocationId(locations[0].id);
    }
  }, [fulfillmentMode, pickupLocationId, confirmData?.pickupLocations]);

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addItem() {
    setItems((prev) => [...prev, { name: "", qty: 1 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItems = items.filter((i) => i.name.trim());
    if (
      validItems.length === 0 ||
      !rentalStartDate ||
      !rentalEndDate
    ) {
      return;
    }
    if (fulfillmentMode === "pickup" && !pickupLocationId) return;
    if (fulfillmentMode === "delivery" && addressMode === "different" && !deliveryAddress.trim()) {
      return;
    }
    if (
      fulfillmentMode === "delivery" &&
      addressMode === "saved" &&
      !(confirmData?.customerAddress ?? "").trim()
    ) {
      setError("No address on file — please choose a different address and enter your delivery details.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fresh = await rentPublicActionService.requestConfirmView(token);
      if (fresh.data.alreadyProcessed) {
        setConfirmData(fresh.data);
        setServerMessage(fresh.message ?? null);
        setSubmitted(true);
        setError(fresh.message ?? "This link is no longer active. Please use the latest email from us.");
        return;
      }

      const r = await rentPublicActionService.requestConfirmSubmit(token, {
        fulfillmentMode,
        rentalStartDate,
        rentalEndDate,
        ...(fulfillmentMode === "pickup"
          ? { pickupLocationId }
          : {
              addressMode,
              deliveryAddress:
                addressMode === "different" ? deliveryAddress.trim() : undefined,
            }),
        rentalItems: validItems.map((i) => ({
          name: i.name.trim(),
          qty: Math.max(1, parseInt(String(i.qty), 10) || 1),
        })),
        customerMessage: customerMessage.trim() || undefined,
      });
      setConfirmData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      const msg = extractApiError(e);
      setError(msg);
      if (/outdated|latest email|no longer active|declined this request/i.test(msg)) {
        try {
          const fresh = await rentPublicActionService.requestConfirmView(token);
          setConfirmData(fresh.data);
          setServerMessage(fresh.message ?? null);
          if (fresh.data.alreadyProcessed) setSubmitted(true);
        } catch {
          /* keep primary error */
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeclineSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await rentPublicActionService.requestDeclineSubmit(token);
      setDeclineData(r.data);
      setServerMessage(r.message ?? null);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(extractApiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const data = isConfirm ? confirmData : declineData;
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
  const savedAddress = isConfirm ? (confirmData?.customerAddress ?? "").trim() : "";
  const pickupLocations = isConfirm ? (confirmData?.pickupLocations ?? []) : [];

  const title = done
    ? isConfirm
      ? "Request confirmed"
      : "Request declined"
    : isConfirm
      ? "Confirm your rental request"
      : "Decline request";

  return (
    <ActionShell icon={isConfirm ? "✅" : "📋"} title={title} subtitle={`Reference #${data.requestId}`}>
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
        {isConfirm && !done
          ? "confirm your rental dates, pickup or delivery, address, and items below."
          : !isConfirm && !done
            ? "you can decline this rental request below. No reason is required."
            : isConfirm
              ? "thanks — we've received your confirmation. Our team will send you a quote shortly."
              : "your request has been declined."}
      </p>

      {isConfirm && !done ? (
        <form onSubmit={handleConfirmSubmit} className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Rental period
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">From date</label>
                <input
                  type="date"
                  required
                  min={minDate}
                  value={rentalStartDate}
                  onChange={(e) => setRentalStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm [color-scheme:light]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">To date</label>
                <input
                  type="date"
                  required
                  min={rentalStartDate || minDate}
                  value={rentalEndDate}
                  onChange={(e) => setRentalEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm [color-scheme:light]"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pickup or delivery?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["pickup", "delivery"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFulfillmentMode(mode)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold capitalize transition ${
                    fulfillmentMode === mode
                      ? "border-[#398ff7] bg-[#eff6ff] text-[#398ff7]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {mode === "pickup" ? "Pickup" : "Home delivery"}
                </button>
              ))}
            </div>
          </div>

          {fulfillmentMode === "pickup" ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pickup location
              </p>
              {pickupLocations.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
                  No pickup locations are configured for this region yet. Please choose home delivery or contact us.
                </p>
              ) : (
                <div className="space-y-2">
                  {pickupLocations.map((loc) => (
                    <label
                      key={loc.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition ${
                        pickupLocationId === loc.id
                          ? "border-[#398ff7] bg-[#eff6ff]"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pickupLocation"
                        checked={pickupLocationId === loc.id}
                        onChange={() => setPickupLocationId(loc.id)}
                        className="mt-1"
                        required
                      />
                      <span className="text-sm text-slate-700">
                        <span className="font-semibold">{loc.label}</span>
                        <span className="mt-0.5 block text-[12px] text-slate-500">{loc.address}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Delivery address
            </p>
            {savedAddress ? (
              <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <input
                  type="radio"
                  name="addressMode"
                  checked={addressMode === "saved"}
                  onChange={() => setAddressMode("saved")}
                  className="mt-1"
                />
                <span className="text-sm text-slate-700">
                  <span className="font-semibold">Use address on file</span>
                  <span className="mt-0.5 block text-[12px] text-slate-500">{savedAddress}</span>
                </span>
              </label>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
              <input
                type="radio"
                name="addressMode"
                checked={addressMode === "different"}
                onChange={() => setAddressMode("different")}
                className="mt-1"
              />
              <span className="text-sm font-semibold text-slate-700">
                {savedAddress ? "Use a different address" : "Enter your delivery address"}
              </span>
            </label>
            {addressMode === "different" ? (
              <textarea
                required
                rows={3}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="Full delivery address including landmark…"
              />
            ) : null}
          </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rental items</p>
              <button type="button" onClick={addItem} className="text-xs font-semibold text-[#398ff7]">
                + Add item
              </button>
            </div>
            <div className="mb-1 grid grid-cols-[1fr_64px_28px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Item</span>
              <span className="text-center">Qty</span>
              <span />
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_64px_28px] gap-2">
                  <input
                    required
                    placeholder="Item name"
                    value={item.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateItem(i, { qty: parseInt(e.target.value, 10) || 1 })}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-center"
                    aria-label="Qty"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Remove item"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Message for our team (optional)
            </label>
            <textarea
              rows={3}
              value={customerMessage}
              onChange={(e) => setCustomerMessage(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Anything you'd like us to know about your rental…"
            />
          </div>

          <button
            type="submit"
            disabled={
              submitting ||
              (fulfillmentMode === "pickup" && pickupLocations.length === 0)
            }
            className="w-full rounded-lg bg-[#398ff7] py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Confirm request"}
          </button>
        </form>
      ) : null}

      {!isConfirm && !done ? (
        <button
          type="button"
          disabled={submitting}
          onClick={() => { void handleDeclineSubmit(); }}
          className="w-full rounded-lg border-2 border-red-200 bg-white py-3 text-sm font-bold text-red-600 disabled:opacity-60"
        >
          {submitting ? "Declining…" : "Decline request"}
        </button>
      ) : null}

      {done && isConfirm && confirmData ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
          {confirmData.rentalStartDate && confirmData.rentalEndDate ? (
            <InfoRow
              label="Rental period"
              value={`${formatDateDDMMYY(confirmData.rentalStartDate)} → ${formatDateDDMMYY(confirmData.rentalEndDate)}`}
            />
          ) : null}
          {confirmData.fulfillmentMode ? (
            <InfoRow
              label="Fulfillment"
              value={confirmData.fulfillmentMode === "delivery" ? "Home delivery" : "Pickup"}
            />
          ) : null}
          {confirmData.fulfillmentMode === "pickup" && confirmData.confirmedAddress ? (
            <InfoRow label="Pickup location" value={confirmData.confirmedAddress} />
          ) : null}
          {confirmData.fulfillmentMode === "delivery" && confirmData.confirmedAddress ? (
            <InfoRow label="Delivery address" value={confirmData.confirmedAddress} />
          ) : null}
          {confirmData.rentalItems?.length ? (
            <div className="mb-3 mt-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Your items</p>
              <div className="space-y-1">
                {confirmData.rentalItems.map((item, i) => (
                  <InfoRow key={i} label={item.name} value={`Qty ${item.qty}`} />
                ))}
              </div>
            </div>
          ) : null}
          {confirmData.customerMessage ? (
            <InfoRow label="Your message" value={confirmData.customerMessage} />
          ) : null}
        </div>
      ) : null}
    </ActionShell>
  );
}
