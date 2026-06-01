"use client";

import type { RentAgreementData } from "@/services/rent-public-action.service";
import { formatDisplayMoney } from "@/lib/format-display-money";
import { rentPaymentScheduleRows } from "@/lib/rent-payment-terms";

export function RentPaymentTermsNotice({
  data,
  className = "",
}: {
  data: Pick<RentAgreementData, "fulfillmentMode" | "securityDeposit" | "rentalAmount" | "currency">;
  className?: string;
}) {
  const depositFmt = formatDisplayMoney(data.securityDeposit ?? "", data.currency);
  const rentalFmt = formatDisplayMoney(data.rentalAmount ?? "", data.currency);
  const rows = rentPaymentScheduleRows(data.fulfillmentMode, depositFmt, rentalFmt);
  if (!rows.length) return null;

  return (
    <div
      className={`rounded-xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white px-3.5 py-3 text-[11px] leading-relaxed text-slate-700 ${className}`}
    >
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#398ff7]">
        When to pay
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="rounded-lg border border-sky-100/80 bg-white/80 px-2.5 py-2">
            <p className="font-semibold text-slate-900">
              {row.label}
              {row.amount ? <span className="text-[#398ff7]"> · {row.amount}</span> : null}
            </p>
            <p className="mt-0.5 text-slate-600">{row.due}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
