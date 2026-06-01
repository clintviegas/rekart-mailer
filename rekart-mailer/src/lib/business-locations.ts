import { REPAIR_SERVICE_CENTRES_BY_CURRENCY } from "@/lib/repair-service-centres";
import type { RentJourneyCurrency } from "@/types/rent";

export interface BusinessLocation {
  id: string;
  label: string;
  address: string;
}

export type BusinessLocationsByCurrency = Partial<
  Record<RentJourneyCurrency, BusinessLocation[]>
>;

export const BUSINESS_LOCATION_CURRENCIES: RentJourneyCurrency[] = [
  "AED",
  "INR",
  "USD",
  "SAR",
];

export const CURRENCY_FLAGS: Record<RentJourneyCurrency, string> = {
  AED: "🇦🇪",
  INR: "🇮🇳",
  USD: "🇺🇸",
  SAR: "🇸🇦",
};

function normalizeCurrency(currency: string | undefined | null): RentJourneyCurrency {
  const c = String(currency ?? "AED")
    .trim()
    .toUpperCase();
  if (c === "INR" || c === "USD" || c === "SAR" || c === "AED") return c;
  return "AED";
}

function defaultLocationsForCurrency(currency: RentJourneyCurrency): BusinessLocation[] {
  return REPAIR_SERVICE_CENTRES_BY_CURRENCY[currency].map((c) => ({
    id: c.id,
    label: c.label,
    address: c.address,
  }));
}

export function getBusinessLocations(
  currency: string | undefined | null,
  stored?: BusinessLocationsByCurrency | null,
): BusinessLocation[] {
  const key = normalizeCurrency(currency);
  const custom = stored?.[key];
  if (Array.isArray(custom) && custom.length > 0) {
    return custom
      .map((row) => ({
        id: String(row.id ?? "").trim(),
        label: String(row.label ?? "").trim(),
        address: String(row.address ?? "").trim(),
      }))
      .filter((row) => row.id && row.label && row.address);
  }
  return defaultLocationsForCurrency(key);
}

export function emptyBusinessLocationsByCurrency(): BusinessLocationsByCurrency {
  return {
    AED: [],
    INR: [],
    USD: [],
    SAR: [],
  };
}

export function normalizeBusinessLocationsByCurrency(
  raw?: BusinessLocationsByCurrency | Record<string, BusinessLocation[]> | null,
): BusinessLocationsByCurrency {
  const out = emptyBusinessLocationsByCurrency();
  if (!raw || typeof raw !== "object") return out;
  for (const currency of BUSINESS_LOCATION_CURRENCIES) {
    const rows = raw[currency];
    if (!Array.isArray(rows)) continue;
    out[currency] = rows
      .map((row) => ({
        id: String(row.id ?? "").trim(),
        label: String(row.label ?? "").trim(),
        address: String(row.address ?? "").trim(),
      }))
      .filter((row) => row.label && row.address)
      .map((row) => ({ ...row, id: row.id || crypto.randomUUID() }));
  }
  return out;
}

export function defaultBusinessLocationsByCurrency(): BusinessLocationsByCurrency {
  const out = emptyBusinessLocationsByCurrency();
  for (const currency of BUSINESS_LOCATION_CURRENCIES) {
    out[currency] = defaultLocationsForCurrency(currency);
  }
  return out;
}

export function hasSavedBusinessLocations(
  raw?: BusinessLocationsByCurrency | Record<string, BusinessLocation[]> | null,
): boolean {
  if (!raw || typeof raw !== "object") return false;
  return BUSINESS_LOCATION_CURRENCIES.some(
    (c) => Array.isArray(raw[c]) && (raw[c]?.length ?? 0) > 0,
  );
}

export function resolveEditableBusinessLocations(
  raw?: BusinessLocationsByCurrency | Record<string, BusinessLocation[]> | null,
): BusinessLocationsByCurrency {
  if (hasSavedBusinessLocations(raw)) {
    return normalizeBusinessLocationsByCurrency(raw);
  }
  return defaultBusinessLocationsByCurrency();
}

export function newBusinessLocation(): BusinessLocation {
  return {
    id: crypto.randomUUID(),
    label: "",
    address: "",
  };
}
