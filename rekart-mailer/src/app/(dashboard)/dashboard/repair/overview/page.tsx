import type { Metadata } from "next";
import { RepairOverviewClient } from "./repair-overview";

export const metadata: Metadata = {
  title: "Repair Overview — Rekart Mailer",
  description: "Real-time overview of all Repair request journeys and email activity.",
};

export default function RepairOverviewPage() {
  return <RepairOverviewClient />;
}
