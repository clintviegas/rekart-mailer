"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { publicActionService, type ReceiptData } from "@/services/public-action.service";
import {
  ActionShell,
  InfoRow,
  LoadingCard,
  ErrorCard,
} from "../../_components/action-shell";
import { InlineSuccessBadge } from "@/components/shared/action-header-icon";

export default function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData]   = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicActionService
      .receipt(token)
      .then((r) => setData(r.data))
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (!data && !error) return <LoadingCard />;
  if (error) return <ErrorCard message={error} />;
  if (!data)  return <ErrorCard message="Could not load receipt." />;

  return (
    <ActionShell icon="🧾" title="Payment Receipt" subtitle={`Request ${data.requestId}`}>
      <p className="text-sm text-slate-600 mb-4">
        Hi <strong>{data.customerName}</strong>, here's your payment receipt.
      </p>

      <div className="bg-slate-50 rounded-lg overflow-hidden border border-slate-200 mb-4">
        <div className="bg-slate-100 px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
          Payment Details
        </div>
        <div className="px-4 py-3 divide-y divide-slate-100">
          <InfoRow label="Request ID"     value={data.requestId} />
          <InfoRow label="Item"         value={data.deviceName} />
          <InfoRow label="Amount"         value={data.paymentAmount ? `${data.currency ?? ""} ${data.paymentAmount}` : undefined} />
          <InfoRow label="Transaction ID" value={data.transactionId} />
          <InfoRow label="Payout Method"  value={data.payoutMethod} />
          <InfoRow label="Account / UPI"  value={data.accountDetails} />
          <InfoRow label="Processed On"   value={data.paymentDate} />
        </div>
      </div>

      <InlineSuccessBadge>Payment successfully processed</InlineSuccessBadge>
    </ActionShell>
  );
}
