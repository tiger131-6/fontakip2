import db from './db';

export interface TechnicalScreenerPricePoint {
  date: string;
  price: number;
}

export interface TechnicalScreenerSeries {
  fund_code: string;
  prices: TechnicalScreenerPricePoint[];
}

export interface TechnicalScreenerResponse {
  days: number;
  rangeStart: string;
  rangeEnd: string;
  series: TechnicalScreenerSeries[];
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTechnicalScreenerData(days = 90): TechnicalScreenerResponse {
  const safeDays = Number.isFinite(days) ? Math.max(20, Math.min(365, Math.floor(days))) : 90;

  const rangeEnd = isoDate(new Date());
  const start = new Date();
  start.setDate(start.getDate() - safeDays);
  const rangeStart = isoDate(start);

  const rows = db
    .prepare(
      `SELECT ph.fund_code, ph.price_date, ph.price
       FROM price_history ph
       INNER JOIN funds f ON f.fund_code = ph.fund_code
       WHERE f.is_active = 1
         AND f.fund_code != 'ALTIN'
         AND ph.price_date >= ?
         AND ph.price_date <= ?
       ORDER BY ph.fund_code ASC, ph.price_date ASC`
    )
    .all(rangeStart, rangeEnd) as Array<{
    fund_code: string;
    price_date: string;
    price: number;
  }>;

  const byFund = new Map<string, TechnicalScreenerPricePoint[]>();

  for (const row of rows) {
    let arr = byFund.get(row.fund_code);
    if (!arr) {
      arr = [];
      byFund.set(row.fund_code, arr);
    }
    arr.push({ date: row.price_date, price: row.price });
  }

  const series = [...byFund.entries()]
    .map(([fund_code, prices]) => ({ fund_code, prices }))
    .sort((a, b) => a.fund_code.localeCompare(b.fund_code, 'tr-TR'));

  return {
    days: safeDays,
    rangeStart,
    rangeEnd,
    series,
  };
}
