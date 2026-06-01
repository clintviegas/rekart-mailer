export const SELL_PICKUP_TIME_WINDOWS = [
  '9:00 AM – 12:00 PM',
  '12:00 PM – 3:00 PM',
  '3:00 PM – 6:00 PM',
  '6:00 PM – 9:00 PM',
] as const;

export const SELL_PICKUP_TIME_ANY = 'Any time';

export const SELL_PICKUP_TIME_WINDOW_SELECT_OPTIONS = [
  ...SELL_PICKUP_TIME_WINDOWS,
  SELL_PICKUP_TIME_ANY,
] as const;

export function isSellPickupTimeAny(value: string | undefined | null): boolean {
  return String(value ?? '').trim().toLowerCase() === 'any time';
}

export function isValidSellPickupTimeWindowSelection(value: string): boolean {
  const v = value.trim();
  return (SELL_PICKUP_TIME_WINDOW_SELECT_OPTIONS as readonly string[]).includes(v);
}
