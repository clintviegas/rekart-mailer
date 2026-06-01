"use client";

import React from "react";
import { CustomerRekartLogo } from "@/components/shared/customer-rekart-logo";
import { ActionHeaderIcon } from "@/components/shared/action-header-icon";

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  status?: "idle" | "loading" | "success" | "error";
}

/** Customer-facing shell — Rekart email header blue (#398ff7). */
export function ActionShell({ icon, title, subtitle, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f0fdf4] px-4 py-10 text-slate-900">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_50px_-12px_rgba(15,23,42,0.18)]">
          <div className="bg-[#398ff7] pl-2 pr-4 pt-3 pb-4">
            <div className="flex items-start gap-2">
              <CustomerRekartLogo variant="onDark" size="lg" className="-ml-1.5 w-[124px] shrink-0" />
              <div className="min-w-0 flex-1 text-center">
                <ActionHeaderIcon icon={icon} />
                <h1 className="mt-1 text-lg font-bold leading-snug text-white">{title}</h1>
                {subtitle ? (
                  <p className="mt-1 text-sm text-white/85">{subtitle}</p>
                ) : null}
              </div>
              <div className="w-[124px] shrink-0" aria-hidden />
            </div>
          </div>
          <div className="p-6">{children}</div>
          <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3 text-center">
            <p className="text-[11px] leading-relaxed text-slate-500">
              <a href="https://rekart.ae" className="font-semibold text-sky-600 hover:underline" target="_blank" rel="noreferrer">
                rekart.ae
              </a>
              {" · "}
              <a href="mailto:hello@rekart.ae" className="text-slate-600 hover:underline">
                hello@rekart.ae
              </a>
            </p>
            <p className="mt-1 text-[10px] text-slate-400">Private link — don&apos;t share with others</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="max-w-[55%] text-right text-xs font-semibold text-[#0f172a]">{value}</span>
    </div>
  );
}

export function StatusBadge({ step }: { step: string }) {
  const label = step
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      {label}
    </span>
  );
}

export function LoadingCard() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f0fdf4] px-4">
      <CustomerRekartLogo size="md" className="mb-6" />
      <div
        className="size-11 rounded-full border-[3px] border-emerald-200 border-t-emerald-600 animate-spin"
        aria-hidden
      />
      <p className="mt-5 text-sm font-medium text-slate-600">One moment…</p>
    </div>
  );
}

export function ErrorCard({ message, code }: { message: string; code?: "token" | "generic" }) {
  const isToken =
    code === "token" ||
    /invalid|tampered|expired/i.test(message) ||
    message.toLowerCase().includes("token");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f0fdf4] px-4 py-10">
      <CustomerRekartLogo size="md" className="mb-5" />
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-200/90 bg-white shadow-lg">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-center">
          <div className="mb-1 text-3xl" aria-hidden>🔗</div>
          <h1 className="text-lg font-bold text-white">
            {isToken ? "We couldn’t open this link" : "Something went wrong"}
          </h1>
        </div>
        <div className="space-y-4 p-6 text-center">
          <p className="text-sm leading-relaxed text-slate-600">
            {isToken
              ? "This secure link may be broken, outdated, or was copied incorrectly. Please open the latest email from us or request a new link."
              : message}
          </p>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left text-xs text-slate-600">
            <p className="font-semibold text-[#0f172a]">Need help?</p>
            <p className="mt-1">
              Email{" "}
              <a href="mailto:hello@rekart.ae" className="font-medium text-sky-600 hover:underline">
                hello@rekart.ae
              </a>{" "}
              with your request ID if you have it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
