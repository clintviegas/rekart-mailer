export type RecycleCollectionMode = "listed" | "bulk_estimate";

export type RecycleBulkEstimateBand = "1-5" | "6-20" | "21-50" | "50+" | "unknown";

export interface RecycleItemLine {
  name: string;
  qty: number | "unknown";
}

export interface RecycleBulkCategoryLine {
  category: string;
  qty: number | "unknown";
}

export const RECYCLE_ASSET_CATEGORIES = [
  "Laptops",
  "Desktops",
  "Monitors",
  "Phones & Tablets",
  "Servers & Networking",
  "Printers",
  "Other IT Equipment",
] as const;

export const RECYCLE_BULK_ESTIMATE_OPTIONS: { value: RecycleBulkEstimateBand; label: string }[] = [
  { value: "1-5", label: "1–5 devices" },
  { value: "6-20", label: "6–20 devices" },
  { value: "21-50", label: "21–50 devices" },
  { value: "50+", label: "50+ devices" },
  { value: "unknown", label: "Unknown — assess onsite" },
];

export function normalizeRecycleQty(value: unknown): number | "unknown" {
  if (value === "unknown" || value === "" || value == null) return "unknown";
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return "unknown";
  return n;
}

export function formatRecycleQty(qty: number | "unknown"): string {
  return qty === "unknown" ? "TBD" : String(qty);
}

export function buildRecycleItemsSummary(items: RecycleItemLine[]): string {
  return items
    .filter((i) => i.name.trim())
    .map((i) => `${i.name.trim()} ×${formatRecycleQty(i.qty)}`)
    .join(", ");
}

export function buildRecycleBulkSummary(data: {
  bulkEstimate?: string;
  bulkDescription?: string;
  bulkCategories?: RecycleBulkCategoryLine[];
}): string {
  const parts: string[] = [];
  if (data.bulkEstimate) {
    const label = RECYCLE_BULK_ESTIMATE_OPTIONS.find((o) => o.value === data.bulkEstimate)?.label;
    parts.push(`Est. volume: ${label ?? data.bulkEstimate}`);
  }
  if (Array.isArray(data.bulkCategories) && data.bulkCategories.length) {
    parts.push(
      data.bulkCategories
        .filter((c) => c.category.trim())
        .map((c) => `${c.category} ×${formatRecycleQty(c.qty)}`)
        .join(", "),
    );
  }
  if (data.bulkDescription?.trim()) parts.push(data.bulkDescription.trim());
  return parts.filter(Boolean).join(" · ");
}

export function buildRecycleDynamicDataFromForm(input: {
  collectionMode: RecycleCollectionMode;
  recycleItems?: RecycleItemLine[];
  bulkEstimate?: RecycleBulkEstimateBand;
  bulkDescription?: string;
  bulkCategories?: RecycleBulkCategoryLine[];
  pickupAddress?: string;
  collectionNotes?: string;
}): Record<string, unknown> {
  const mode = input.collectionMode;
  const out: Record<string, unknown> = {
    collectionMode: mode,
    pickupAddress: input.pickupAddress?.trim() ?? "",
    collectionNotes: input.collectionNotes?.trim() ?? "",
  };

  if (mode === "listed") {
    const items = (input.recycleItems ?? [])
      .filter((i) => i.name.trim())
      .map((i) => ({ name: i.name.trim(), qty: normalizeRecycleQty(i.qty) }));
    out.recycleItems = items;
    out.recycleItemsSummary = buildRecycleItemsSummary(items);
  } else {
    out.bulkEstimate = input.bulkEstimate ?? "unknown";
    out.bulkDescription = input.bulkDescription?.trim() ?? "";
    out.bulkCategories = (input.bulkCategories ?? []).filter((c) => c.category.trim());
    out.recycleItemsSummary = buildRecycleBulkSummary({
      bulkEstimate: out.bulkEstimate as string,
      bulkDescription: out.bulkDescription as string,
      bulkCategories: out.bulkCategories as RecycleBulkCategoryLine[],
    });
  }

  return out;
}
