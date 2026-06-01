export const REPAIR_STORE_COLLECTION_BUILTIN = {
  id: "store-10-9",
  label: "Store — 10:00 AM – 9:00 PM",
  from: "10:00",
  to: "21:00",
} as const;

export const REPAIR_COLLECTION_HOURS_CUSTOM_ID = "custom";
export const REPAIR_COLLECTION_HOURS_USER_DEFAULT_ID = "user-default";

const LS_KEY = "rekart.repair.storeCollectionHoursDefault";

export interface CollectionHoursPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  isUserDefault?: boolean;
}

function hmTo12Short(hm: string): string {
  const [hh, mm] = hm.split(":").map((x) => Number(x));
  if (Number.isNaN(hh)) return "";
  const dt = new Date(2000, 0, 1, hh, mm || 0);
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatCollectionHoursWindow(fromHm: string, toHm: string): string {
  if (!fromHm || !toHm) return "";
  return `${hmTo12Short(fromHm)}–${hmTo12Short(toHm)}`;
}

function parse12hPartToHm(part: string): string {
  const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";
  let h = Number(m[1]);
  const mi = m[2];
  const ap = m[3].toUpperCase();
  if (Number.isNaN(h)) return "";
  if (h === 12) h = ap === "AM" ? 0 : 12;
  else if (ap === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${mi}`;
}

/** Parse stored collection hours (12h email label or 24h pair). */
export function parseCollectionHoursWindow(saved: string): { from: string; to: string } | null {
  const s = saved.trim();
  if (!s) return null;
  if (/AM|PM/i.test(s)) {
    const parts = s.split(/\s*[–-]\s*/);
    if (parts.length === 2) {
      const from = parse12hPartToHm(parts[0]);
      const to = parse12hPartToHm(parts[1]);
      if (from && to) return { from, to };
    }
  }
  const m = s.match(/^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/);
  if (m) {
    const norm = (part: string) => {
      const [h, mi] = part.split(":");
      return `${h.padStart(2, "0")}:${mi ?? "00"}`;
    };
    return { from: norm(m[1]), to: norm(m[2]) };
  }
  return null;
}

export function readUserCollectionHoursDefault(): { from: string; to: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { from?: string; to?: string };
    const from = String(parsed.from ?? "").trim();
    const to = String(parsed.to ?? "").trim();
    if (from && to && from < to) return { from, to };
  } catch {
    /* ignore */
  }
  return null;
}

export function writeUserCollectionHoursDefault(from: string, to: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify({ from, to }));
}

export function clearUserCollectionHoursDefault(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEY);
}

export function getEffectiveCollectionHoursDefault(): { from: string; to: string } {
  return (
    readUserCollectionHoursDefault() ?? {
      from: REPAIR_STORE_COLLECTION_BUILTIN.from,
      to: REPAIR_STORE_COLLECTION_BUILTIN.to,
    }
  );
}

function presetLabel(from: string, to: string, userDefault = false): string {
  const window = `${hmTo12Short(from)} – ${hmTo12Short(to)}`;
  return userDefault ? `Your default — ${window}` : `Store — ${window}`;
}

export function buildCollectionHoursPresetOptions(): CollectionHoursPreset[] {
  const user = readUserCollectionHoursDefault();
  const builtin = REPAIR_STORE_COLLECTION_BUILTIN;
  const options: CollectionHoursPreset[] = [
    {
      id: builtin.id,
      label: builtin.label,
      from: builtin.from,
      to: builtin.to,
    },
  ];
  if (user && (user.from !== builtin.from || user.to !== builtin.to)) {
    options.push({
      id: REPAIR_COLLECTION_HOURS_USER_DEFAULT_ID,
      label: presetLabel(user.from, user.to, true),
      from: user.from,
      to: user.to,
      isUserDefault: true,
    });
  }
  options.push({
    id: REPAIR_COLLECTION_HOURS_CUSTOM_ID,
    label: "Custom hours…",
    from: "",
    to: "",
  });
  return options;
}

function matchPresetId(from: string, to: string): string {
  const builtin = REPAIR_STORE_COLLECTION_BUILTIN;
  if (from === builtin.from && to === builtin.to) return builtin.id;
  const user = readUserCollectionHoursDefault();
  if (user && from === user.from && to === user.to) {
    return REPAIR_COLLECTION_HOURS_USER_DEFAULT_ID;
  }
  return REPAIR_COLLECTION_HOURS_CUSTOM_ID;
}

/** Initial dropdown + times — journey saved value, else effective default (10 AM–9 PM or user default). */
export function resolveCollectionHoursInitial(savedCollectionHours: string): {
  presetId: string;
  from: string;
  to: string;
} {
  const parsed = parseCollectionHoursWindow(savedCollectionHours);
  if (parsed) {
    return {
      presetId: matchPresetId(parsed.from, parsed.to),
      from: parsed.from,
      to: parsed.to,
    };
  }
  const def = getEffectiveCollectionHoursDefault();
  return {
    presetId: matchPresetId(def.from, def.to),
    from: def.from,
    to: def.to,
  };
}

export function isEffectiveCollectionHoursDefault(from: string, to: string): boolean {
  const def = getEffectiveCollectionHoursDefault();
  return from === def.from && to === def.to;
}

export function isBuiltinCollectionHours(from: string, to: string): boolean {
  return (
    from === REPAIR_STORE_COLLECTION_BUILTIN.from &&
    to === REPAIR_STORE_COLLECTION_BUILTIN.to
  );
}
