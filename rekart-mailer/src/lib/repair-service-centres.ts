import type { JourneyCurrency } from "@/types/repair";
import {
  getBusinessLocations,
  type BusinessLocationsByCurrency,
} from "@/lib/business-locations";

export interface RepairServiceCentreOption {
  id: string;
  label: string;
  address: string;
  /** Default when no saved value — usually the store / collect-from-store location. */
  isDefault?: boolean;
}

const AED_CENTRES: RepairServiceCentreOption[] = [
  {
    id: "hq-dubai",
    label: "HQ — Dubai Media City",
    address: "HQ: G01, Boutique Villa 9, Dubai Media City, Dubai",
  },
  {
    id: "store-bur-dubai",
    label: "Store — Meena Bazaar (collect from store)",
    address: "Shop 13, Souq Musalla, Meena Bazaar, Bur Dubai",
    isDefault: true,
  },
  {
    id: "warehouse-sharjah",
    label: "Warehouse — Sharjah",
    address: "Section D6, Hazrat Ali Warehouse, Industrial Area 6, Sharjah",
  },
];

const INR_CENTRES: RepairServiceCentreOption[] = [
  {
    id: "store-delhi",
    label: "Store — Connaught Place (collect from store)",
    address: "Rekart Service Centre, Connaught Place, New Delhi",
    isDefault: true,
  },
  {
    id: "hq-mumbai",
    label: "HQ — Bandra Kurla Complex, Mumbai",
    address: "HQ: Rekart HQ, Bandra Kurla Complex, Mumbai",
  },
  {
    id: "warehouse-bengaluru",
    label: "Warehouse — Whitefield, Bengaluru",
    address: "Rekart Warehouse, Whitefield Industrial Area, Bengaluru",
  },
];

const USD_CENTRES: RepairServiceCentreOption[] = [
  {
    id: "store-nyc",
    label: "Store — Manhattan (collect from store)",
    address: "Rekart Store, Manhattan, New York, NY",
    isDefault: true,
  },
  {
    id: "hq-sf",
    label: "HQ — San Francisco",
    address: "HQ: Rekart HQ, Market Street, San Francisco, CA",
  },
  {
    id: "warehouse-dallas",
    label: "Warehouse — Dallas",
    address: "Rekart Fulfillment Centre, Dallas, TX",
  },
];

const SAR_CENTRES: RepairServiceCentreOption[] = [
  {
    id: "store-riyadh",
    label: "Store — Olaya District (collect from store)",
    address: "Rekart Store, Olaya District, Riyadh",
    isDefault: true,
  },
  {
    id: "hq-kafd",
    label: "HQ — King Abdullah Financial District, Riyadh",
    address: "HQ: Rekart HQ, King Abdullah Financial District, Riyadh",
  },
  {
    id: "warehouse-jeddah",
    label: "Warehouse — Jeddah",
    address: "Rekart Warehouse, Jeddah Industrial City",
  },
];

export const REPAIR_SERVICE_CENTRES_BY_CURRENCY: Record<
  JourneyCurrency,
  RepairServiceCentreOption[]
> = {
  AED: AED_CENTRES,
  INR: INR_CENTRES,
  USD: USD_CENTRES,
  SAR: SAR_CENTRES,
};

function normalizeCurrency(currency: string | undefined | null): JourneyCurrency {
  const c = String(currency ?? "AED")
    .trim()
    .toUpperCase();
  if (c === "INR" || c === "USD" || c === "SAR" || c === "AED") return c;
  return "AED";
}

export function getRepairServiceCentres(
  currency: string | undefined | null,
  stored?: BusinessLocationsByCurrency | null,
): RepairServiceCentreOption[] {
  const fromBranding = getBusinessLocations(currency, stored);
  if (stored && fromBranding.length > 0) {
    return fromBranding.map((loc, index) => ({
      id: loc.id,
      label: loc.label,
      address: loc.address,
      isDefault: index === 0,
    }));
  }
  return REPAIR_SERVICE_CENTRES_BY_CURRENCY[normalizeCurrency(currency)];
}

export function getDefaultRepairServiceCentreAddress(
  currency: string | undefined | null,
): string {
  const centres = getRepairServiceCentres(currency);
  return centres.find((c) => c.isDefault)?.address ?? centres[0]?.address ?? "";
}

export function normalizeRepairPickUpAddress(address: string): string {
  return String(address ?? "")
    .trim()
    .replace(/^Store:\s*/i, "");
}

/** Resolve initial diagnosis centre — saved value, or currency default (store). */
export function resolveRepairServiceCentreInitial(
  saved: string,
  currency: string | undefined | null,
): string {
  const trimmed = normalizeRepairPickUpAddress(saved);
  if (trimmed) {
    const centres = getRepairServiceCentres(currency);
    const match = centres.find((c) => c.address === trimmed);
    if (match) return match.address;
    return trimmed;
  }
  return getDefaultRepairServiceCentreAddress(currency);
}

/** Include saved custom value in dropdown when it is not in the preset list. */
export function buildRepairServiceCentreOptions(
  currency: string | undefined | null,
  selectedAddress: string,
  stored?: BusinessLocationsByCurrency | null,
): RepairServiceCentreOption[] {
  const base = getRepairServiceCentres(currency, stored);
  const trimmed = normalizeRepairPickUpAddress(selectedAddress);
  if (!trimmed || base.some((o) => o.address === trimmed)) return base;
  return [
    { id: "saved-custom", label: "Saved address", address: trimmed },
    ...base,
  ];
}
