import type { PricePoint } from '../types';
import { filterHistoryByRange, type ChartRange } from './calculateReturns';

export interface CompareSeries {
  code: string;
  history: PricePoint[];
}

export interface ComparisonChartPoint {
  date: string;
  baseFundPct: number;
  baseFundPrice: number;
  compareFundPct?: number;
  compareFundPrice?: number;
}

function toAscending(history: PricePoint[]): Array<{ date: string; price: number }> {
  return [...history]
    .reverse()
    .map((p) => ({ date: p.price_date, price: p.price }));
}

/** Latest price on or before `date` within ascending series. */
function priceOnOrBefore(
  asc: Array<{ date: string; price: number }>,
  date: string
): number | undefined {
  let found: number | undefined;
  for (const row of asc) {
    if (row.date > date) break;
    found = row.price;
  }
  return found;
}

function pctFromStart(price: number, startPrice: number): number {
  return ((price - startPrice) / startPrice) * 100;
}

/**
 * Build normalized % return series for base + one compare fund, aligned by date.
 * Each series starts at 0% at the oldest price in the selected range.
 */
export function buildNormalizedComparisonData(
  baseHistory: PricePoint[],
  compare: CompareSeries | null,
  range: ChartRange
): ComparisonChartPoint[] {
  const baseFiltered = filterHistoryByRange(baseHistory, range);
  const baseAsc = toAscending(baseFiltered);
  if (baseAsc.length === 0) return [];

  const baseStart = baseAsc[0].price;
  if (!Number.isFinite(baseStart) || baseStart <= 0) return [];

  let compareAsc: Array<{ date: string; price: number }> = [];
  let compareStart = 0;

  if (compare && compare.history.length > 0) {
    const compareFiltered = filterHistoryByRange(compare.history, range);
    compareAsc = toAscending(compareFiltered);
    if (compareAsc.length > 0) {
      compareStart = compareAsc[0].price;
    }
  }

  const dateSet = new Set<string>();
  for (const p of baseAsc) dateSet.add(p.date);
  for (const p of compareAsc) dateSet.add(p.date);
  const dates = [...dateSet].sort();

  const hasCompare =
    compareAsc.length > 0 && Number.isFinite(compareStart) && compareStart > 0;

  return dates
    .map((date) => {
      const basePrice = priceOnOrBefore(baseAsc, date);
      if (basePrice == null) return null;

      const point: ComparisonChartPoint = {
        date,
        baseFundPct: pctFromStart(basePrice, baseStart),
        baseFundPrice: basePrice,
      };

      if (hasCompare) {
        const comparePrice = priceOnOrBefore(compareAsc, date);
        if (comparePrice != null) {
          point.compareFundPct = pctFromStart(comparePrice, compareStart);
          point.compareFundPrice = comparePrice;
        }
      }

      return point;
    })
    .filter((p): p is ComparisonChartPoint => p != null);
}

export const COMPARISON_LINE_COLORS = [
  '#4f46e5',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

export type MultiFundChartPoint = {
  date: string;
  [fundCode: string]: number | string;
};

/**
 * Normalized % return series for multiple funds on a shared date axis.
 * Each fund starts at 0% at the oldest price in the selected range.
 */
export function buildMultiFundComparisonData(
  seriesList: CompareSeries[],
  range: ChartRange
): MultiFundChartPoint[] {
  const prepared = seriesList
    .map((s) => {
      const filtered = filterHistoryByRange(s.history, range);
      const asc = toAscending(filtered);
      const start = asc[0]?.price ?? 0;
      return { code: s.code, asc, start };
    })
    .filter((p) => p.asc.length > 0 && Number.isFinite(p.start) && p.start > 0);

  if (prepared.length === 0) return [];

  const dateSet = new Set<string>();
  for (const p of prepared) {
    for (const row of p.asc) dateSet.add(row.date);
  }

  return [...dateSet]
    .sort()
    .map((date) => {
      const point: MultiFundChartPoint = { date };
      for (const p of prepared) {
        const price = priceOnOrBefore(p.asc, date);
        if (price != null) {
          point[p.code] = pctFromStart(price, p.start);
        }
      }
      return point;
    })
    .filter((point) => prepared.some((p) => point[p.code] != null));
}
