import type { Metadata } from "next";
import { RentOverviewClient } from "./rent-overview";

export const metadata: Metadata = {
  title: "RENT Overview — Rekart Mailer",
  description: "Real-time summary of rent request journeys.",
};

export default function RentOverviewPage() {
  return <RentOverviewClient />;
}
