import type { RentItemLine } from "@/types/rent";

export interface RentItemChangeSet {
  added: RentItemLine[];
  removed: RentItemLine[];
  qtyChanged: Array<{ name: string; from: number; to: number }>;
}

function norm(name: string): string {
  return name.trim().toLowerCase();
}

export function computeRentItemChanges(
  original: RentItemLine[],
  confirmed: RentItemLine[],
): RentItemChangeSet {
  const origMap = new Map<string, RentItemLine>();
  for (const item of original) {
    const key = norm(item.name);
    if (!key) continue;
    origMap.set(key, { name: item.name.trim(), qty: Math.max(1, item.qty), rate: String(item.rate ?? "") });
  }

  const confMap = new Map<string, RentItemLine>();
  for (const item of confirmed) {
    const key = norm(item.name);
    if (!key) continue;
    confMap.set(key, { name: item.name.trim(), qty: Math.max(1, item.qty), rate: String(item.rate ?? "") });
  }

  const added: RentItemLine[] = [];
  const removed: RentItemLine[] = [];
  const qtyChanged: Array<{ name: string; from: number; to: number }> = [];

  for (const [key, c] of confMap) {
    const o = origMap.get(key);
    if (!o) added.push(c);
    else if (o.qty !== c.qty) qtyChanged.push({ name: c.name, from: o.qty, to: c.qty });
  }

  for (const [key, o] of origMap) {
    if (!confMap.has(key)) removed.push(o);
  }

  return { added, removed, qtyChanged };
}

export function hasRentItemChanges(changes: RentItemChangeSet): boolean {
  return changes.added.length > 0 || changes.removed.length > 0 || changes.qtyChanged.length > 0;
}
