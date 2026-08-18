import db from './db';

export interface FundCagrResult {
  fund_code: string;
  cagr: number | null;
  cagr_pct: number | null;
  years: number;
  start_date: string | null;
  end_date: string | null;
  data_points: number;
}

const stmtHistory = db.prepare(`
  SELECT price_date, price FROM price_history
  WHERE fund_code = ?
  ORDER BY price_date ASC
`);

/** Compound annual growth rate from first to last price in local history. */
export function computeFundCagr(fundCode: string): FundCagrResult {
  const rows = stmtHistory.all(fundCode) as Array<{ price_date: string; price: number }>;

  if (rows.length < 2) {
    return {
      fund_code: fundCode,
      cagr: null,
      cagr_pct: null,
      years: 0,
      start_date: rows[0]?.price_date ?? null,
      end_date: rows[rows.length - 1]?.price_date ?? null,
      data_points: rows.length,
    };
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const startMs = new Date(first.price_date).getTime();
  const endMs = new Date(last.price_date).getTime();
  const years = (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000);

  if (years <= 0 || first.price <= 0 || last.price <= 0) {
    return {
      fund_code: fundCode,
      cagr: null,
      cagr_pct: null,
      years,
      start_date: first.price_date,
      end_date: last.price_date,
      data_points: rows.length,
    };
  }

  const cagr = Math.pow(last.price / first.price, 1 / years) - 1;
  return {
    fund_code: fundCode,
    cagr,
    cagr_pct: cagr * 100,
    years,
    start_date: first.price_date,
    end_date: last.price_date,
    data_points: rows.length,
  };
}
