"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import type { RentAgreementData } from "@/services/rent-public-action.service";
import {
  canDownloadSignedRentAgreement,
  downloadSignedRentAgreement,
  printSignedRentAgreement,
} from "@/lib/rent-agreement-download";

export function RentSignedAgreementDownload({
  data,
  className = "",
}: {
  data: RentAgreementData;
  className?: string;
}) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  if (!canDownloadSignedRentAgreement(data)) return null;

  async function handleDownload() {
    setBusy("download");
    try {
      await downloadSignedRentAgreement(data);
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    setBusy("print");
    try {
      await printSignedRentAgreement(data);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy === "download" ? (
          <Loader2 className="size-4 animate-spin text-[#398ff7]" />
        ) : (
          <Download className="size-4 text-[#398ff7]" />
        )}
        Download signed agreement
      </button>
      <button
        type="button"
        onClick={() => void handlePrint()}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy === "print" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <FileText className="size-3.5" />
        )}
        Save as PDF (Print)
      </button>
      <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
        Branded Rekart copy with logo. Use &ldquo;Save as PDF&rdquo; on your phone or computer if you need a PDF file.
      </p>
    </div>
  );
}
