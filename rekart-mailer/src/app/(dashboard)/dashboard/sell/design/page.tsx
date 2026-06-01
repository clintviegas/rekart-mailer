import type { Metadata } from "next";
import { SellDesignClient } from "./sell-design";

export const metadata: Metadata = {
  title: "SELL Email Design — Rekart Mailer",
  description: "Branding, colors, typography and email design for SELL workflows.",
};

export default function SellDesignPage() {
  return <SellDesignClient />;
}
