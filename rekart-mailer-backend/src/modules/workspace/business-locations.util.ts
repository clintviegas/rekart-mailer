export interface BusinessLocation {
  id: string;
  label: string;
  address: string;
}

export type BusinessLocationsByCurrency = Record<string, BusinessLocation[]>;

export const JOURNEY_CURRENCIES = ['AED', 'INR', 'USD', 'SAR'] as const;
export type JourneyCurrency = (typeof JOURNEY_CURRENCIES)[number];

const DEFAULT_BY_CURRENCY: BusinessLocationsByCurrency = {
  AED: [
    {
      id: 'hq-dubai',
      label: 'HQ — Dubai Media City',
      address: 'HQ: G01, Boutique Villa 9, Dubai Media City, Dubai',
    },
    {
      id: 'store-bur-dubai',
      label: 'Store — Meena Bazaar',
      address: 'Shop 13, Souq Musalla, Meena Bazaar, Bur Dubai',
    },
    {
      id: 'warehouse-sharjah',
      label: 'Warehouse — Sharjah',
      address: 'Section D6, Hazrat Ali Warehouse, Industrial Area 6, Sharjah',
    },
  ],
  INR: [
    {
      id: 'store-delhi',
      label: 'Store — Connaught Place',
      address: 'Rekart Service Centre, Connaught Place, New Delhi',
    },
    {
      id: 'hq-mumbai',
      label: 'HQ — Bandra Kurla Complex, Mumbai',
      address: 'HQ: Rekart HQ, Bandra Kurla Complex, Mumbai',
    },
    {
      id: 'warehouse-bengaluru',
      label: 'Warehouse — Whitefield, Bengaluru',
      address: 'Rekart Warehouse, Whitefield Industrial Area, Bengaluru',
    },
  ],
  USD: [
    {
      id: 'store-nyc',
      label: 'Store — Manhattan',
      address: 'Rekart Store, Manhattan, New York, NY',
    },
    {
      id: 'hq-sf',
      label: 'HQ — San Francisco',
      address: 'HQ: Rekart HQ, Market Street, San Francisco, CA',
    },
    {
      id: 'warehouse-dallas',
      label: 'Warehouse — Dallas',
      address: 'Rekart Fulfillment Centre, Dallas, TX',
    },
  ],
  SAR: [
    {
      id: 'store-riyadh',
      label: 'Store — Olaya District',
      address: 'Rekart Store, Olaya District, Riyadh',
    },
    {
      id: 'hq-kafd',
      label: 'HQ — King Abdullah Financial District, Riyadh',
      address: 'HQ: Rekart HQ, King Abdullah Financial District, Riyadh',
    },
    {
      id: 'warehouse-jeddah',
      label: 'Warehouse — Jeddah',
      address: 'Rekart Warehouse, Jeddah Industrial City',
    },
  ],
};

export function normalizeJourneyCurrency(
  currency: string | undefined | null,
): JourneyCurrency {
  const c = String(currency ?? 'AED')
    .trim()
    .toUpperCase();
  if (c === 'INR' || c === 'USD' || c === 'SAR' || c === 'AED') return c;
  return 'AED';
}

export function resolveBusinessLocations(
  currency: string | undefined | null,
  stored?: BusinessLocationsByCurrency | null,
): BusinessLocation[] {
  const key = normalizeJourneyCurrency(currency);
  const custom = stored?.[key];
  if (Array.isArray(custom) && custom.length > 0) {
    return custom
      .map((row) => ({
        id: String(row.id ?? '').trim(),
        label: String(row.label ?? '').trim(),
        address: String(row.address ?? '').trim(),
      }))
      .filter((row) => row.id && row.label && row.address);
  }
  return DEFAULT_BY_CURRENCY[key] ?? [];
}

export function findBusinessLocation(
  currency: string | undefined | null,
  locationId: string | undefined | null,
  stored?: BusinessLocationsByCurrency | null,
): BusinessLocation | null {
  const id = String(locationId ?? '').trim();
  if (!id) return null;
  return resolveBusinessLocations(currency, stored).find((l) => l.id === id) ?? null;
}
