import type { Metadata } from "next";
import { XCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CustomerRekartLogo } from "@/components/shared/customer-rekart-logo";

export const metadata: Metadata = {
  title: "Invalid Link — Rekart Mailer",
};

export default function UnsubscribeInvalidPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
      <CustomerRekartLogo className="mb-5" />
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-xl dark:bg-card">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-6 text-center">
          <p className="text-[13px] font-bold tracking-widest text-white/70 uppercase">
            Email preferences
          </p>
        </div>
        <div className="px-8 py-8 text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <XCircle className="size-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Invalid link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This unsubscribe link is invalid or has expired. Please use the
            link from your original email.
          </p>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Need help?{" "}
            <a
              href="mailto:support@rekartmailer.io"
              className="text-primary hover:underline"
            >
              Contact support
            </a>
          </p>
        </div>
        <div className="border-t border-border bg-muted/30 px-8 py-4 text-center">
          <p className="text-[10px] text-muted-foreground">
            © {new Date().getFullYear()} Rekart Mailer
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
