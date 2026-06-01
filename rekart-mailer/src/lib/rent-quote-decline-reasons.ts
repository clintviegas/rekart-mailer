/** Customer-facing decline reasons on rent quote / agreement. */
export const RENT_QUOTE_DECLINE_REASONS = [
  "Price is too high",
  "Need more time to decide",
  "Found another rental option",
  "Items not available as quoted",
  "Dates do not work for me",
  "Other",
] as const;

export const RENT_QUOTE_REVISE_TYPES = [
  {
    value: "after_reason" as const,
    label: "Revised after customer feedback",
    description: "Email references their decline reason and shows an updated quote.",
  },
  {
    value: "final_offer" as const,
    label: "Final offer — no further reduction",
    description: "Best price email with Accept or Decline options.",
  },
] as const;

export type RentQuoteReviseType = (typeof RENT_QUOTE_REVISE_TYPES)[number]["value"];
