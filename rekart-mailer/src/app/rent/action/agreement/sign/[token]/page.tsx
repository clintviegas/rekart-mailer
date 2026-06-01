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
  LoadingCard,
  ErrorCard,
} from "@/app/repair/action/_components/action-shell";
import { InlineWarningBadge } from "@/components/shared/action-header-icon";
import { RentAgreementDocument } from "@/components/rent/rent-agreement-document";
import { RentSignaturePad } from "@/components/rent/rent-signature-pad";
import {
  RENT_ESIGN_CONSENT_TEXT,
  isValidSignatureDataUrl,
  todaySignatureDateLabel,
} from "@/lib/rent-agreement-esign";
import { formatDateTimeDDMMYY } from "@/lib/date-format";
import { RentSignedAgreementDownload } from "@/components/rent/rent-signed-agreement-download";

export default function RentAgreementSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenParam } = use(params);
  const token = decodeURIComponent(tokenParam);

  const [data, setData] = useState<RentAgreementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signatureImage, setSignatureImage] = useState("");
  const [signedDate] = useState(() => todaySignatureDateLabel());
  const [consentGiven, setConsentGiven] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    rentPublicActionService
      .agreementAcceptView(token)
      .then((r) => {
        setData(r.data);
        setServerMessage(r.message ?? null);
        setSignerName(String(r.data.customerName ?? "").trim());
        if (r.data.alreadyProcessed) setSubmitted(true);
      })
      .catch((e: unknown) => setError(extractApiError(e)));
  }, [token]);

  const canSubmit =
    signerName.trim().length >= 2 &&
    isValidSignatureDataUrl(signatureImage) &&
    consentGiven &&
    !submitting &&
    !submitted &&
    !data?.alreadyProcessed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await rentPublicActionService.agreementAcceptSubmit(token, {
        signerName: signerName.trim(),
        signatureImage,
        signedDate,
        consentGiven: true,
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
  if (!data) return <ErrorCard message="Could not load agreement." code="generic" />;

  const done = submitted || data.alreadyProcessed;
  const title = done ? "Agreement signed" : "Sign rental agreement";

  return (
    <ActionShell icon="✍️" title={title} subtitle={`Reference #${data.requestId}`}>
      {done && serverMessage ? (
        <div className="mb-4">
          <InlineWarningBadge>{serverMessage}</InlineWarningBadge>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      {!done ? (
        <p className="mb-4 text-sm leading-relaxed text-slate-600">
          Please read the agreement below, then sign with your name and signature. Today&apos;s date (
          <strong>{signedDate}</strong>) will be recorded with your e-sign.
        </p>
      ) : (
        <p className="mb-4 text-sm leading-relaxed text-slate-600">
          Thank you — your rental agreement is signed. Our team will prepare your rental.
        </p>
      )}

      <div className="mb-4">
        <RentAgreementDocument data={data} companyName={data.companyName} />
      </div>

      {done ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-[12px] text-emerald-950">
            <p>
              <strong>Signed by:</strong> {data.agreementSignerName || signerName}
            </p>
            <p className="mt-1">
              <strong>Date:</strong>{" "}
              {data.agreementSignedDateDisplay || signedDate}
              {data.agreementSignedAt
                ? ` · ${formatDateTimeDDMMYY(data.agreementSignedAt)}`
                : null}
            </p>
            {data.agreementSignatureImage ? (
              <div className="mt-3 rounded-lg border border-emerald-200/80 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.agreementSignatureImage}
                  alt="Your signature"
                  className="mx-auto max-h-16 w-auto"
                />
              </div>
            ) : null}
          </div>
          <RentSignedAgreementDownload data={data} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signer-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Full legal name
            </label>
            <input
              id="signer-name"
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="As on your ID / trade licence"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              Signature
            </label>
            <RentSignaturePad value={signatureImage} onChange={setSignatureImage} disabled={submitting} />
          </div>

          <div>
            <label htmlFor="signed-date" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Date of signing
            </label>
            <input
              id="signed-date"
              readOnly
              value={signedDate}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="mt-0.5"
              required
            />
            <span className="text-[11px] leading-relaxed text-slate-700">{RENT_ESIGN_CONSENT_TEXT}</span>
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-[#398ff7] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2d7fe0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting signature…" : "Sign & submit agreement"}
          </button>

          <Link
            href={`/rent/action/agreement/accept/${encodeURIComponent(token)}`}
            className="block text-center text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            ← Back to quote review
          </Link>
        </form>
      )}
    </ActionShell>
  );
}
