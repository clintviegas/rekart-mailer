import type { Metadata } from "next";
import { RentDesignClient } from "./rent-design";

export const metadata: Metadata = {
  title: "RENT Email Design — Rekart Mailer",
  description: "Workflow steps and email templates for RENT journeys.",
};

export default function RentDesignPage() {
  return <RentDesignClient />;
}
