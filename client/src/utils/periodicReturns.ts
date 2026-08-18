import { daysInMonth, pad2 } from './dateRange';
import { subtractTime } from './calculateReturns';

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

/** Max calendar days to walk backward when target falls on a non-trading day. */
const TRADING_DAY_LOOKBACK = 30;

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function formatIsoUtc(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Subtract calendar days from YYYY-MM-DD (UTC-safe). */
export function daysBeforeIso(iso: string, days: number): string {
  const { y, m, d } = parseIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return formatIsoUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday (UTC). */
function dayOfWeekUtc(iso: string): number {
  const { y, m, d } = parseIso(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Last trading day of the previous calendar week (anchor: prior week's Friday). */
export function wtdAnchor(latestDate: string): string {
  const dow = dayOfWeekUtc(latestDate);
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekStart = daysBeforeIso(latestDate, daysFromMonday);
  return daysBeforeIso(weekStart, 3);
}

/** Last calendar day of the previous month (trading day resolved via lookback). */
export function mtdAnchor(latestDate: string): string {
  const { y, m } = parseIso(latestDate);
  let prevY = y;
  let prevM = m - 1;
  if (prevM < 1) {
    prevM = 12;
    prevY -= 1;
  }
  const lastDay = daysInMonth(prevY, prevM);
  return `${prevY}-${pad2(prevM)}-${pad2(lastDay)}`;
}

/** Last calendar day of the previous year (Dec 31; trading day resolved via lookback). */
export function ytdAnchor(latestDate: string): string {
  const y = parseIso(latestDate).y;
  return `${y - 1}-12-31`;
}

export const PERIODIC_RETURN_PERIODS = [
  { key: 'wtd', label: 'Haftabaşı (%)', anchor: wtdAnchor },
  { key: '1w', label: 'Haftalık (%)', anchor: (d: string) => daysBeforeIso(d, 7) },
  { key: 'mtd', label: 'Aybaşı (%)', anchor: mtdAnchor },
  { key: '1m', label: 'Aylık (%)', anchor: (d: string) => subtractTime(d, 1, 0) },
  { key: '6m', label: '6 Aylık (%)', anchor: (d: string) => subtractTime(d, 6, 0) },
  { key: 'ytd', label: 'Yılbaşı (%)', anchor: ytdAnchor },
  { key: '1y', label: 'Yıllık (%)', anchor: (d: string) => subtractTime(d, 0, 1) },
] as const;

export type PeriodicReturnKey = (typeof PERIODIC_RETURN_PERIODS)[number]['key'];

/**
 * Walk backward from `targetDate` to the closest prior trading day with a price.
 * `price_history` must be ascending by date.
 */
export function findHistoricalPrice(
  priceHistory: PriceHistoryPoint[],
  targetDate: string
): number | null {
  if (!priceHistory.length) return null;

  const oldestDate = priceHistory[0].date;
  if (targetDate < oldestDate) return null;

  const priceByDate = new Map(priceHistory.map((p) => [p.date, p.price]));
  let cursor = targetDate;

  for (let i = 0; i <= TRADING_DAY_LOOKBACK; i++) {
    const price = priceByDate.get(cursor);
    if (price != null && Number.isFinite(price) && price > 0) return price;
    if (cursor <= oldestDate) break;
    cursor = daysBeforeIso(cursor, 1);
  }

  return null;
}

/** Latest available price in ascending `price_history`. */
export function getCurrentPrice(priceHistory: PriceHistoryPoint[]): number | null {
  if (!priceHistory.length) return null;
  const latest = priceHistory[priceHistory.length - 1];
  if (!Number.isFinite(latest.price) || latest.price <= 0) return null;
  return latest.price;
}

export function getLatestDate(priceHistory: PriceHistoryPoint[]): string | null {
  if (!priceHistory.length) return null;
  return priceHistory[priceHistory.length - 1].date;
}

/** ((current - past) / past) * 100; null when history is insufficient. */
export function calculatePeriodReturn(
  priceHistory: PriceHistoryPoint[],
  targetDate: string
): number | null {
  const currentPrice = getCurrentPrice(priceHistory);
  if (currentPrice == null) return null;

  const pastPrice = findHistoricalPrice(priceHistory, targetDate);
  if (pastPrice == null) return null;

  const pct = ((currentPrice - pastPrice) / pastPrice) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export interface PeriodicReturnRow {
  key: PeriodicReturnKey;
  label: string;
  values: Array<number | null>;
}

/** Compute all standard period returns for one fund series (ascending dates). */
export function computePeriodicReturnsForFund(
  priceHistory: PriceHistoryPoint[]
): Record<PeriodicReturnKey, number | null> {
  const latestDate = getLatestDate(priceHistory);
  const result = {} as Record<PeriodicReturnKey, number | null>;

  if (!latestDate) {
    for (const period of PERIODIC_RETURN_PERIODS) result[period.key] = null;
    return result;
  }

  for (const period of PERIODIC_RETURN_PERIODS) {
    result[period.key] = calculatePeriodReturn(priceHistory, period.anchor(latestDate));
  }

  return result;
}

/** Build footer rows aligned with `fundCount` column indices. */
export function computePeriodicReturnRows(
  fundPriceHistories: PriceHistoryPoint[][]
): PeriodicReturnRow[] {
  return PERIODIC_RETURN_PERIODS.map((period) => ({
    key: period.key,
    label: period.label,
    values: fundPriceHistories.map((history) => {
      const latestDate = getLatestDate(history);
      if (!latestDate) return null;
      return calculatePeriodReturn(history, period.anchor(latestDate));
    }),
  }));
}
