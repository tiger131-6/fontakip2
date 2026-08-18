/** Calendar days to scan back when "today" may be a non-trading day. */
export const TRADING_LOOKBACK_DAYS = 7;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Subtract calendar days from YYYY-MM-DD (local calendar). */
export function daysBeforeIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function lookbackStartFromToday(days = TRADING_LOOKBACK_DAYS): string {
  return daysBeforeIso(todayIso(), days);
}

export interface LatestPricePoint {
  date: string;
  price: number;
}

/**
 * Pick the newest row with a valid price (descending by date).
 * Returns null when the array is empty or has no usable prices.
 */
export function pickLatestPrice<T>(
  rows: T[],
  getDate: (row: T) => string,
  getPrice: (row: T) => number | null | undefined
): LatestPricePoint | null {
  const valid: LatestPricePoint[] = [];

  for (const row of rows) {
    const date = getDate(row);
    const price = getPrice(row);
    if (!date || !Number.isFinite(price) || (price as number) <= 0) continue;
    valid.push({ date, price: price as number });
  }

  if (valid.length === 0) return null;

  valid.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return valid[0];
}
