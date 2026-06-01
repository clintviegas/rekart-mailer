import type { Metadata } from "next";
import { Suspense } from "react";
import { UnsubscribeSuccessContent } from "./unsubscribe-success-content";

export const metadata: Metadata = {
  title: "Unsubscribed — Rekart Mailer",
  description: "You have been successfully unsubscribed.",
};

export default function UnsubscribeSuccessPage() {
  return (
    <Suspense>
      <UnsubscribeSuccessContent />
    </Suspense>
  );
}
