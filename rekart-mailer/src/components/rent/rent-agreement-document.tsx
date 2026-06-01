"use client";

import type { ReactNode } from "react";
import type { RentAgreementData } from "@/services/rent-public-action.service";
import { formatDateDDMMYY } from "@/lib/date-format";
import { CustomerRekartLogo } from "@/components/shared/customer-rekart-logo";
import { RENT_AGREEMENT_COLORS as C } from "@/lib/rent-agreement-design";
import {
  buildRentQuoteBreakdown,
  formatRentQuoteMoney,
} from "@/lib/rent-quote-breakdown";
import {
  rentDepositAndPaymentSection,
  rentPaymentScheduleRows,
} from "@/lib/rent-payment-terms";
import { formatDisplayMoney } from "@/lib/format-display-money";
import { RentPaymentTermsNotice } from "@/components/rent/rent-payment-terms-notice";

function fmtDate(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  return formatDateDDMMYY(s) || s;
}

function SummaryRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#bfdbfe]/80 py-2.5 last:border-0">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <div className="max-w-[58%] text-right">
        <span className="text-[11px] font-bold text-slate-900">{value}</span>
        {note ? <p className="mt-0.5 text-[10px] font-medium text-slate-500">{note}</p> : null}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl border px-3.5 py-3"
      style={{ backgroundColor: C.lightBgAlt, borderColor: C.lightBorder }}
    >
      <h3
        className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em]"
        style={{ color: C.accent }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export function RentAgreementDocument({
  data,
  companyName,
}: {
  data: RentAgreementData;
  companyName?: string;
}) {
  const lessor = companyName?.trim() || "Rekart";
  const quote = buildRentQuoteBreakdown(
    data.rentalItems,
    data.quoteDiscounts,
    data.rentalAmount,
  );
  const showPricing = quote.lines.some((line) => line.rate > 0) || quote.subtotal > 0;
  const fmt = (amount: number) =>
    amount > 0 ? formatRentQuoteMoney(amount, data.currency) : "—";
  const fulfillment =
    String(data.fulfillmentMode ?? "").toLowerCase() === "pickup"
      ? "Pickup"
      : String(data.fulfillmentMode ?? "").toLowerCase() === "delivery"
        ? "Delivery"
        : "As agreed";
  const depositFmt = formatDisplayMoney(data.securityDeposit ?? "", data.currency);
  const rentalFmt = formatDisplayMoney(String(quote.total || data.rentalAmount), data.currency);
  const paymentRows = rentPaymentScheduleRows(data.fulfillmentMode, depositFmt, rentalFmt);
  const depositDue = paymentRows.find((r) => r.label.startsWith("Security"))?.due;
  const rentalDue = paymentRows.find((r) => r.label.startsWith("Rental"))?.due;

  return (
    <div
      className="overflow-hidden rounded-xl border shadow-[0_12px_40px_-20px_rgba(57,143,247,0.35)]"
      style={{ borderColor: C.lightBorder }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3.5"
        style={{ background: `linear-gradient(135deg, ${C.topBar} 0%, ${C.topBarDark} 100%)` }}
      >
        <CustomerRekartLogo variant="onDark" size="sm" className="shrink-0" />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/95">
          Rent Journey
        </span>
      </div>

      <div
        className="border-b px-4 py-4 text-center"
        style={{
          background: `linear-gradient(180deg, ${C.lightBgAlt} 0%, ${C.white} 100%)`,
          borderColor: C.lightBorder,
        }}
      >
        <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-slate-900">
          Equipment Rental Agreement
        </p>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          <span
            className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold text-slate-500"
            style={{ backgroundColor: C.lightBg, borderColor: C.lightBorder }}
          >
            Request #{data.requestId}
          </span>
          {data.currency ? (
            <span
              className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold text-slate-500"
              style={{ backgroundColor: C.lightBg, borderColor: C.lightBorder }}
            >
              {data.currency}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="max-h-[min(48vh,380px)] space-y-3 overflow-y-auto px-3.5 py-3.5 text-[11px] leading-relaxed text-slate-700 scrollbar-thin"
        style={{ backgroundColor: C.white }}
      >
        <div
          className="rounded-xl border px-3 py-2.5 text-[11px] text-slate-700"
          style={{ backgroundColor: C.lightBg, borderColor: C.lightBorder }}
        >
          This Rental Agreement (&ldquo;Agreement&rdquo;) is entered into electronically between{" "}
          <strong style={{ color: C.accent }}>{lessor}</strong> (&ldquo;Lessor&rdquo;) and{" "}
          <strong style={{ color: C.accent }}>{data.customerName || "the Customer"}</strong>{" "}
          (&ldquo;Renter&rdquo;) on the date of electronic signature below.
        </div>

        <Section title="1. Rental summary">
          <SummaryRow
            label="Rental period"
            value={`${fmtDate(data.rentalStartDate)} → ${fmtDate(data.returnDueDate || data.rentalEndDate)}`}
          />
          <SummaryRow
            label="Quote total"
            value={rentalFmt}
            note={rentalDue}
          />
          <SummaryRow
            label="Security deposit"
            value={depositFmt}
            note={depositDue}
          />
          <SummaryRow label="Fulfillment" value={fulfillment} />
          {data.confirmedAddress ? (
            <SummaryRow label="Address" value={data.confirmedAddress} />
          ) : null}
        </Section>

        <RentPaymentTermsNotice data={data} />

        {quote.lines.length > 0 ? (
          <Section title="2. Quote breakdown">
            <div className="overflow-hidden rounded-lg border" style={{ borderColor: C.lightBorder }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ backgroundColor: C.lightBg }}>
                    <th className="px-2.5 py-2 text-left font-extrabold uppercase tracking-wide text-[#398ff7]">
                      Item
                    </th>
                    <th className="px-2.5 py-2 text-center font-extrabold uppercase tracking-wide text-[#398ff7]">
                      Qty
                    </th>
                    {showPricing ? (
                      <>
                        <th className="px-2.5 py-2 text-right font-extrabold uppercase tracking-wide text-[#398ff7]">
                          Rate
                        </th>
                        <th className="px-2.5 py-2 text-right font-extrabold uppercase tracking-wide text-[#398ff7]">
                          Amount
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((line, idx) => (
                    <tr
                      key={idx}
                      className="border-t"
                      style={{
                        borderColor: C.lightBorder,
                        backgroundColor: idx % 2 === 0 ? C.white : C.lightBgAlt,
                      }}
                    >
                      <td className="px-2.5 py-2 font-medium text-slate-700">{line.name}</td>
                      <td className="px-2.5 py-2 text-center text-slate-600">{line.qty}</td>
                      {showPricing ? (
                        <>
                          <td className="whitespace-nowrap px-2.5 py-2 text-right text-slate-600">
                            {line.rate > 0 ? fmt(line.rate) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold text-slate-800">
                            {line.lineTotal > 0 ? fmt(line.lineTotal) : "—"}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                  {showPricing && quote.discountTotal > 0 ? (
                    <>
                      <tr className="border-t" style={{ borderColor: C.lightBorder }}>
                        <td
                          colSpan={showPricing ? 3 : 1}
                          className="px-2.5 py-2 font-semibold text-slate-500"
                        >
                          Subtotal
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right font-bold text-slate-900">
                          {fmt(quote.subtotal)}
                        </td>
                      </tr>
                      {quote.discounts.map((discount, idx) => (
                        <tr key={`${discount.description}-${idx}`}>
                          <td
                            colSpan={showPricing ? 3 : 1}
                            className="px-2.5 py-1.5 text-emerald-600"
                          >
                            {discount.description}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold text-emerald-600">
                            − {fmt(discount.amount)}
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : null}
                  {showPricing && quote.total > 0 ? (
                    <tr className="border-t-2" style={{ borderColor: C.lightBorder }}>
                      <td
                        colSpan={showPricing ? 3 : 1}
                        className="px-2.5 py-2.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-900"
                      >
                        {quote.discountTotal > 0 ? "Quote total" : "Estimated total"}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-[12px] font-extrabold text-slate-900">
                        {fmt(quote.total)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        <Section title={`${quote.lines.length > 0 ? "3" : "2"}. Renter obligations`}>
          <p>
            Renter shall use the equipment only for lawful purposes, keep it in good condition, not
            sub-rent or transfer without Lessor&apos;s written consent, and return all items by the
            agreed return date in the same condition, ordinary wear excepted.
          </p>
        </Section>

        <Section title={`${quote.lines.length > 0 ? "4" : "3"}. Deposit & payment`}>
          <p>{rentDepositAndPaymentSection(data.fulfillmentMode)}</p>
        </Section>

        <Section title={`${quote.lines.length > 0 ? "5" : "4"}. Loss, damage & liability`}>
          <p>
            Renter is responsible for loss, theft, or damage to rented equipment from pickup/delivery
            until return acceptance. Lessor&apos;s liability is limited to the extent permitted under
            applicable law in the UAE and India, excluding indirect or consequential loss where
            exclusion is allowed.
          </p>
        </Section>

        <Section title={`${quote.lines.length > 0 ? "6" : "5"}. Electronic signature`}>
          <p>
            By signing below, Renter confirms they have read this Agreement, agree to its terms, and
            consent to electronic signing. The parties intend this electronic record and signature to
            be valid under applicable electronic transaction laws in the United Arab Emirates and
            India, including where simple electronic signatures are recognised for commercial
            agreements of this nature.
          </p>
        </Section>
      </div>
    </div>
  );
}
