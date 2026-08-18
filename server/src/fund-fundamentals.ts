import db from './db';

export interface FundMetrics {
  investor_count: number | null;
  portfolio_value: number | null;
  investor_growth_1m: number | null;
  negative_months: number | null;
  volatility: number | null;
}

interface FundamentalsRow {
  fund_code: string;
  investor_count: number | null;
  portfolio_value: number | null;
  investor_growth_1m: number | null;
}

const stmtFundamentals = db.prepare(`
  WITH latest_dates AS (
    SELECT fund_code, MAX(price_date) AS latest_date
    FROM price_history
    WHERE portfolio_value IS NOT NULL
    GROUP BY fund_code
  ),
  latest_metrics AS (
    SELECT ph.fund_code, ph.investor_count, ph.portfolio_value, ld.latest_date
    FROM price_history ph
    JOIN latest_dates ld
      ON ph.fund_code = ld.fund_code AND ph.price_date = ld.latest_date
  ),
  past_ranked AS (
    SELECT ph.fund_code,
           ph.investor_count,
           ROW_NUMBER() OVER (
             PARTITION BY ph.fund_code
             ORDER BY ABS(
               julianday(ph.price_date) - julianday(date(lm.latest_date, '-30 days'))
             ) ASC
           ) AS rn
    FROM price_history ph
    JOIN latest_metrics lm ON ph.fund_code = lm.fund_code
    WHERE ph.investor_count IS NOT NULL
      AND ph.price_date < lm.latest_date
  ),
  past_metrics AS (
    SELECT fund_code, investor_count AS investor_count_1m
    FROM past_ranked
    WHERE rn = 1
  )
  SELECT
    lm.fund_code,
    lm.investor_count,
    lm.portfolio_value,
    CASE
      WHEN lm.investor_count IS NOT NULL AND pm.investor_count_1m IS NOT NULL
      THEN lm.investor_count - pm.investor_count_1m
      ELSE NULL
    END AS investor_growth_1m
  FROM latest_metrics lm
  LEFT JOIN past_metrics pm ON lm.fund_code = pm.fund_code
`);

let cache: { at: number; map: Map<string, FundMetrics> } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Latest FonBul metrics + 1-month investor growth per fund (from local DB). */
export function loadFundFundamentalsMap(forceRefresh = false): Map<string, FundMetrics> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.map;
  }

  const rows = stmtFundamentals.all() as FundamentalsRow[];
  const map = new Map<string, FundMetrics>();
  for (const r of rows) {
    map.set(r.fund_code, {
      investor_count: r.investor_count,
      portfolio_value: r.portfolio_value,
      investor_growth_1m: r.investor_growth_1m,
      negative_months: null,
      volatility: null,
    });
  }

  cache = { at: now, map };
  return map;
}
