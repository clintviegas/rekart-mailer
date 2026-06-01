import { redirect } from "next/navigation";

// SELL Email Templates have moved under the SELL section.
export default function SellTemplateLegacyPage() {
  redirect("/dashboard/sell/templates");
}
