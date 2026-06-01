import type { Metadata } from "next";
import { RecycleDesignClient } from "./recycle-design";

export const metadata: Metadata = {
  title: "Recycle Email Design — Rekart Mailer",
  description: "Branding, colors, typography and email design for Recycle workflows.",
};

export default function RecycleDesignPage() {
  return <RecycleDesignClient />;
}
