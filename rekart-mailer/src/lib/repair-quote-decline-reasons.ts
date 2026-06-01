/** Customer-facing decline reasons on repair quote. */
export const REPAIR_QUOTE_DECLINE_REASONS = [
  "Price is too high",
  "Need more time to decide",
  "Found another repair service",
  "Don't want to proceed with repair",
  "Other",
] as const;

export const REPAIR_QUOTE_REVISE_TYPES = [
  { value: "after_reason", label: "Revised after customer feedback", description: "Email references their decline reason and offers a new quote." },
  { value: "final_offer", label: "Final offer — no further reduction", description: "Best price email with Accept or Return my device options." },
] as const;

export type RepairQuoteReviseType = (typeof REPAIR_QUOTE_REVISE_TYPES)[number]["value"];
