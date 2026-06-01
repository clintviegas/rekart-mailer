import type { Metadata } from "next";
import { SellOverviewClient } from "./sell-overview";

export const metadata: Metadata = {
  title: "SELL Overview — Rekart Mailer",
  description: "Real-time overview of all SELL request journeys and email activity.",
};

export default function SellOverviewPage() {
  return <SellOverviewClient />;
}
