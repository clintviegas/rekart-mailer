"use client";

import { useSearchParams } from "next/navigation";
import { CheckCircle2, Mail, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CustomerRekartLogo } from "@/components/shared/customer-rekart-logo";

export function UnsubscribeSuccessContent() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
      <CustomerRekartLogo className="mb-5" />
      {/* Card */}
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-xl dark:bg-card">
        {/* Brand header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-6 text-center">
          <p className="text-[13px] font-bold tracking-widest text-white/70 uppercase">
            Email preferences
          </p>
        </div>

        {/* Content */}
        <div className="px-8 py-8 text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
          </div>

          <h1 className="text-xl font-bold text-foreground">
            You&apos;re unsubscribed
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You have been successfully removed from our mailing list.
          </p>

          {email && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-4 py-3">
              <Mail className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-medium text-foreground">
                {email}
              </span>
            </div>
          )}

          <div className="mt-6 space-y-2 rounded-xl bg-amber-50 p-4 text-left dark:bg-amber-900/20">
            <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">
              What happens next?
            </p>
            <ul className="space-y-1.5">
              {[
                "You won't receive any more SELL workflow emails",
                "Transactional emails may still be sent if required",
                "You can contact us to re-subscribe at any time",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400"
                >
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-amber-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 text-[11px] text-muted-foreground">
            Changed your mind?{" "}
            <a
              href="mailto:support@rekartmailer.io"
              className="text-primary hover:underline"
            >
              Contact us
            </a>{" "}
            to re-subscribe.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-muted/30 px-8 py-4 text-center">
          <p className="text-[10px] text-muted-foreground">
            © {new Date().getFullYear()} Rekart Mailer · All rights reserved
          </p>
        </div>
      </div>

      <Link
        href="/"
        className="mt-6 flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to home
      </Link>
    </div>
  );
}
