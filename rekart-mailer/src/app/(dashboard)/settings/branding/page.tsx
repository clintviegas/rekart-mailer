import { redirect } from "next/navigation";

// Branding settings have moved to the unified SELL Email Design page.
export default function BrandingPage() {
  redirect("/dashboard/sell/design");
}
