import type { Metadata } from "next";
import { RecycleOverviewClient } from "./recycle-overview";

export const metadata: Metadata = {
  title: "Recycle Overview — Rekart Mailer",
  description: "Real-time overview of all Recycle request journeys and email activity.",
};

export default function RecycleOverviewPage() {
  return <RecycleOverviewClient />;
}
