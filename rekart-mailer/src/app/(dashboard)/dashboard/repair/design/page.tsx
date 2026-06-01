import type { Metadata } from "next";
import { RepairDesignClient } from "./repair-design";

export const metadata: Metadata = {
  title: "Repair Email Design — Rekart Mailer",
  description: "Branding, colors, typography and email design for Repair workflows.",
};

export default function RepairDesignPage() {
  return <RepairDesignClient />;
}
