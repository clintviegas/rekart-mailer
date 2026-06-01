/** How staff describes items at request time. */
export type RecycleCollectionMode = 'listed' | 'bulk_estimate';

export type RecycleBulkEstimateBand =
  | '1-5'
  | '6-20'
  | '21-50'
  | '50+'
  | 'unknown';

export interface RecycleItemLine {
  name: string;
  qty: number | 'unknown';
}

export interface RecycleBulkCategoryLine {
  category: string;
  qty: number | 'unknown';
}

export const RECYCLE_ASSET_CATEGORIES = [
  'Laptops',
  'Desktops',
  'Monitors',
  'Phones & Tablets',
  'Servers & Networking',
  'Printers',
  'Other IT Equipment',
] as const;

export function normalizeRecycleQty(value: unknown): number | 'unknown' {
  if (value === 'unknown' || value === '' || value == null) return 'unknown';
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 'unknown';
  return n;
}

export function formatRecycleQty(qty: number | 'unknown'): string {
  return qty === 'unknown' ? 'Qty TBD' : String(qty);
}

export function buildRecycleItemsSummary(
  items: RecycleItemLine[],
): string {
  return items
    .filter((i) => i.name.trim())
    .map((i) => `${i.name.trim()} ×${formatRecycleQty(i.qty)}`)
    .join(', ');
}

export function buildRecycleBulkSummary(data: {
  bulkEstimate?: string;
  bulkDescription?: string;
  bulkCategories?: RecycleBulkCategoryLine[];
}): string {
  const parts: string[] = [];
  if (data.bulkEstimate) parts.push(`Est. volume: ${data.bulkEstimate} devices`);
  if (Array.isArray(data.bulkCategories) && data.bulkCategories.length) {
    parts.push(
      data.bulkCategories
        .filter((c) => c.category.trim())
        .map((c) => `${c.category} ×${formatRecycleQty(c.qty)}`)
        .join(', '),
    );
  }
  if (data.bulkDescription?.trim()) parts.push(data.bulkDescription.trim());
  return parts.filter(Boolean).join(' · ');
}
