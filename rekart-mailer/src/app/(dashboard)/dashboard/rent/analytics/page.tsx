import type { Metadata } from "next";
import { RentAnalyticsClient } from "./rent-analytics";

export const metadata: Metadata = {
  title: "RENT Analytics — Rekart Mailer",
  description: "Trends, funnel, and revenue analytics for rent journeys.",
};

export default function RentAnalyticsPage() {
  return <RentAnalyticsClient />;
}
