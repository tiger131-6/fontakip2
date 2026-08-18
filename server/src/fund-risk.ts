import db from './db';

export interface FundRiskMetrics {
  negative_months: number | null;
  volatility: number | null;
}

interface PriceRow {
  fund_code: string;
  price_date: string;
  price: number;
}

const stmtRecentPrices = db.prepare(`
  SELECT fund_code, price_date, price
  FROM price_history
  WHERE price_date >= date('now', '-12 months')
  ORDER BY fund_code ASC, price_date ASC
`);

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function computeMonthlyReturns(prices: Array<{ price_date: string; price: number }>): number[] {
  const byMonth = new Map<string, { first: number; last: number }>();
  for (const p of prices) {
    const key = monthKey(p.price_date);
    const prev = byMonth.get(key);
    if (!prev) byMonth.set(key, { first: p.price, last: p.price });
    else prev.last = p.price;
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const returns: number[] = [];
  for (let i = 1; i < months.length; i++) {
    const start = months[i - 1][1].last;
    const end = months[i][1].last;
    if (start > 0) returns.push((end - start) / start);
  }
  return returns;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

let cache: { at: number; map: Map<string, FundRiskMetrics> } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

/** 12-month negative-return month count + monthly return volatility per fund. */
export function loadFundRiskMap(forceRefresh = false): Map<string, FundRiskMetrics> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.map;
  }

  const rows = stmtRecentPrices.all() as PriceRow[];
  const byFund = new Map<string, Array<{ price_date: string; price: number }>>();
  for (const r of rows) {
    const list = byFund.get(r.fund_code) ?? [];
    list.push({ price_date: r.price_date, price: r.price });
    byFund.set(r.fund_code, list);
  }

  const map = new Map<string, FundRiskMetrics>();
  for (const [code, prices] of byFund) {
    const monthlyReturns = computeMonthlyReturns(prices);
    if (monthlyReturns.length === 0) {
      map.set(code, { negative_months: null, volatility: null });
      continue;
    }
    map.set(code, {
      negative_months: monthlyReturns.filter((r) => r < 0).length,
      volatility: stdDev(monthlyReturns),
    });
  }

  cache = { at: now, map };
  return map;
}
