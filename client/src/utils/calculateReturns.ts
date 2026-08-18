import type { PricePoint } from '../types';

export type ChartRange = '1W' | 'MTD' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'MAX';

export type ReturnDisplay = '-' | string;

export interface ReturnPeriod {
  label: string;
  value: ReturnDisplay;
  range: ChartRange;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/**
 * Subtract months/years from a YYYY-MM-DD string using calendar arithmetic.
 * Clamps day to month length (e.g. 2026-03-31 minus 1 month → 2026-02-28).
 */
export function subtractTime(
  dateString: string,
  monthsToSubtract: number,
  yearsToSubtract: number
): string {
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;

  let year = Number(parts[0]);
  let month = Number(parts[1]);
  let day = Number(parts[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateString;
  }

  year -= yearsToSubtract;

  let m = month - monthsToSubtract;
  while (m < 1) {
    m += 12;
    year -= 1;
  }
  month = m;

  const maxDay = daysInMonth(year, month);
  if (day > maxDay) day = maxDay;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Subtract calendar days from a YYYY-MM-DD string. */
export function subtractDays(dateString: string, days: number): string {
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateString;
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** First calendar day of the month containing `dateString` (YYYY-MM-DD). */
function monthStart(dateString: string): string {
  return `${dateString.slice(0, 7)}-01`;
}

/** January 1 of the calendar year containing `dateString`. */
function yearStart(dateString: string): string {
  return `${dateString.slice(0, 4)}-01-01`;
}

function getTargetDateForRange(latestDate: string, range: ChartRange): string | null {
  switch (range) {
    case 'MTD':
      return monthStart(latestDate);
    case '1M':
      return subtractTime(latestDate, 1, 0);
    case '3M':
      return subtractTime(latestDate, 3, 0);
    case '6M':
      return subtractTime(latestDate, 6, 0);
    case 'YTD':
      return yearStart(latestDate);
    case '1Y':
      return subtractTime(latestDate, 0, 1);
    case '3Y':
      return subtractTime(latestDate, 0, 3);
    case '5Y':
      return subtractTime(latestDate, 0, 5);
    default:
      return null;
  }
}

/** Cutoff date (inclusive) for chart filtering; null means show all data. */
export function getCutoffDate(currentDate: string, range: ChartRange): string | null {
  if (range === 'MAX' || range === '1W') return null;
  return getTargetDateForRange(currentDate, range);
}

/** Oldest trading day in newest-first history. */
function oldestDate(historyData: PricePoint[]): string {
  return historyData[historyData.length - 1].price_date;
}

/**
 * True when the fund existed on or before the period anchor.
 * If the first price is after `targetDate`, the period is undefined (show "-").
 */
function hasSufficientHistory(historyData: PricePoint[], targetDate: string): boolean {
  if (!historyData.length) return false;
  return oldestDate(historyData) <= targetDate;
}

/**
 * TEFAS/FonBul anchor price for a calendar target date.
 * Newest-first history:
 * 1. Exact match when the target is a trading day.
 * 2. Otherwise the first trading day on or after the target (weekend/holiday).
 */
export function findClosestTradingDayOnOrAfter(
  historyData: PricePoint[],
  targetDate: string
): PricePoint | undefined {
  const exact = historyData.find((record) => record.price_date === targetDate);
  if (exact) return exact;

  let onOrAfter: PricePoint | undefined;
  for (const record of historyData) {
    if (record.price_date < targetDate) continue;
    if (!onOrAfter || record.price_date < onOrAfter.price_date) onOrAfter = record;
  }
  return onOrAfter;
}

/**
 * Newest-first history: closest trading day on or before `targetDate`
 * (weekends/holidays resolve to the prior trading day).
 */
export function findClosestTradingDayOnOrBefore(
  historyData: PricePoint[],
  targetDate: string
): PricePoint | undefined {
  const exact = historyData.find((record) => record.price_date === targetDate);
  if (exact) return exact;

  for (const record of historyData) {
    if (record.price_date <= targetDate) return record;
  }
  return undefined;
}

/** Filter newest-first history to records on/after the range anchor trading day. */
export function filterHistoryByRange(history: PricePoint[], range: ChartRange): PricePoint[] {
  if (range === 'MAX' || history.length === 0) return history;
  if (range === '1W') {
    const latestDate = history[0].price_date;
    const targetDate = subtractDays(latestDate, 7);
    if (!hasSufficientHistory(history, targetDate)) return history;
    const anchor = findClosestTradingDayOnOrBefore(history, targetDate);
    if (!anchor) return history;
    return history.filter((p) => p.price_date >= anchor.price_date);
  }

  const targetDate = getTargetDateForRange(history[0].price_date, range);
  if (!targetDate) return history;
  if (!hasSufficientHistory(history, targetDate)) return history;

  const anchor = findClosestTradingDayOnOrAfter(history, targetDate);
  const startDate = anchor?.price_date ?? targetDate;
  return history.filter((p) => p.price_date >= startDate);
}

/** ((current - past) / past) * 100, fixed to 4 decimals. */
function pctReturn(current: number, past: number): ReturnDisplay {
  if (!Number.isFinite(past) || past <= 0) return '-';
  const pct = ((current - past) / past) * 100;
  if (!Number.isFinite(pct)) return '-';
  return pct.toFixed(4);
}

function periodReturn(
  historyData: PricePoint[],
  currentPrice: number,
  targetDate: string
): ReturnDisplay {
  if (!hasSufficientHistory(historyData, targetDate)) return '-';
  const pastRecord = findClosestTradingDayOnOrAfter(historyData, targetDate);
  if (!pastRecord) return '-';
  return pctReturn(currentPrice, pastRecord.price);
}

/** Latest price vs price ~7 calendar days ago (closest prior trading day). */
function weeklyReturn(
  historyData: PricePoint[],
  currentPrice: number,
  currentDate: string
): ReturnDisplay {
  const targetDate = subtractDays(currentDate, 7);
  if (!hasSufficientHistory(historyData, targetDate)) return '-';
  const pastRecord = findClosestTradingDayOnOrBefore(historyData, targetDate);
  if (!pastRecord) return '-';
  return pctReturn(currentPrice, pastRecord.price);
}

const WEEKLY_PERIOD: ReturnPeriod = {
  label: 'Haftalık (%)',
  range: '1W',
  value: '-',
};

const MTD_PERIOD: ReturnPeriod = {
  label: 'Aybaşı (%)',
  range: 'MTD',
  value: '-',
};

const PERIOD_DEFS: Array<{ label: string; range: ChartRange; target: (d: string) => string }> = [
  { label: '1 Ay (%)', range: '1M', target: (d) => subtractTime(d, 1, 0) },
  { label: '3 Ay (%)', range: '3M', target: (d) => subtractTime(d, 3, 0) },
  { label: '6 Ay (%)', range: '6M', target: (d) => subtractTime(d, 6, 0) },
  { label: 'Yılbaşından İtibaren (%)', range: 'YTD', target: yearStart },
  { label: '1 Yıl (%)', range: '1Y', target: (d) => subtractTime(d, 0, 1) },
  { label: '3 Yıl (%)', range: '3Y', target: (d) => subtractTime(d, 0, 3) },
  { label: '5 Yıl (%)', range: '5Y', target: (d) => subtractTime(d, 0, 5) },
];

/**
 * Compute standard dashboard return periods from local price history.
 * `historyData` must be ordered newest → oldest (index 0 = latest).
 * Calendar anchors + TEFAS-style on-or-after trading-day resolution.
 */
export function calculateReturns(historyData: PricePoint[]): ReturnPeriod[] {
  const emptyPeriods = (): ReturnPeriod[] => [
    { ...WEEKLY_PERIOD },
    { ...MTD_PERIOD },
    ...PERIOD_DEFS.map(({ label, range }) => ({ label, value: '-', range })),
  ];

  if (!historyData.length) {
    return emptyPeriods();
  }

  const currentPrice = historyData[0].price;
  const currentDate = historyData[0].price_date;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return emptyPeriods();
  }

  const weekly: ReturnPeriod = {
    ...WEEKLY_PERIOD,
    value: weeklyReturn(historyData, currentPrice, currentDate),
  };

  const mtd: ReturnPeriod = {
    ...MTD_PERIOD,
    value: periodReturn(historyData, currentPrice, monthStart(currentDate)),
  };

  return [
    weekly,
    mtd,
    ...PERIOD_DEFS.map(({ label, range, target }) => ({
      label,
      range,
      value: periodReturn(historyData, currentPrice, target(currentDate)),
    })),
  ];
}
