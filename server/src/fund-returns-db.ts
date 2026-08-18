import db from './db';

export interface FundPeriodReturns {
  m1: number | null;
  m3: number | null;
  m6: number | null;
  ytd: number | null;
  y1: number | null;
  y3: number | null;
  y5: number | null;
}

const EMPTY: FundPeriodReturns = {
  m1: null,
  m3: null,
  m6: null,
  ytd: null,
  y1: null,
  y3: null,
  y5: null,
};

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function subtractTime(dateString: string, monthsToSubtract: number, yearsToSubtract: number): string {
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;

  let year = Number(parts[0]);
  let month = Number(parts[1]);
  let day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateString;

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


const stmtLatestPerFund = db.prepare(`
  SELECT ph.fund_code, ph.price_date, ph.price
  FROM price_history ph
  INNER JOIN (
    SELECT fund_code, MAX(price_date) AS md
    FROM price_history
    WHERE price IS NOT NULL AND price > 0
    GROUP BY fund_code
  ) latest ON ph.fund_code = latest.fund_code AND ph.price_date = latest.md
`);

/** First trading day on or after `anchor` within a 30-day forward window. */
const stmtPriceOnOrAfter = db.prepare(`
  SELECT price, price_date FROM price_history
  WHERE fund_code = ?
    AND price_date >= ?
    AND price_date <= ?
    AND price IS NOT NULL AND price > 0
  ORDER BY price_date ASC
  LIMIT 1
`);

function daysAfterIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function periodReturn(
  fundCode: string,
  currentPrice: number,
  latestDate: string,
  anchor: string
): number | null {
  const ceiling = daysAfterIso(anchor, 30);
  const row = stmtPriceOnOrAfter.get(fundCode, anchor, ceiling) as
    | { price: number; price_date: string }
    | undefined;
  if (!row?.price || !Number.isFinite(row.price) || row.price <= 0) return null;
  const pct = ((currentPrice - row.price) / row.price) * 100;
  return Number.isFinite(pct) ? pct : null;
}

function computeForFund(
  fundCode: string,
  latestDate: string,
  currentPrice: number
): FundPeriodReturns {
  const ytdAnchor = `${latestDate.slice(0, 4)}-01-01`;
  return {
    m1: periodReturn(fundCode, currentPrice, latestDate, subtractTime(latestDate, 1, 0)),
    m3: periodReturn(fundCode, currentPrice, latestDate, subtractTime(latestDate, 3, 0)),
    m6: periodReturn(fundCode, currentPrice, latestDate, subtractTime(latestDate, 6, 0)),
    ytd: periodReturn(fundCode, currentPrice, latestDate, ytdAnchor),
    y1: periodReturn(fundCode, currentPrice, latestDate, subtractTime(latestDate, 0, 1)),
    y3: periodReturn(fundCode, currentPrice, latestDate, subtractTime(latestDate, 0, 3)),
    y5: periodReturn(fundCode, currentPrice, latestDate, subtractTime(latestDate, 0, 5)),
  };
}

let cachedReturns: { at: number; map: Map<string, FundPeriodReturns> } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Bulk-compute TEFAS-style period returns from local price_history (latest trading day). */
export function loadReturnsFromDb(forceRefresh = false): Map<string, FundPeriodReturns> {
  const now = Date.now();
  if (!forceRefresh && cachedReturns && now - cachedReturns.at < CACHE_TTL_MS) {
    return cachedReturns.map;
  }

  const latestRows = stmtLatestPerFund.all() as Array<{
    fund_code: string;
    price_date: string;
    price: number;
  }>;

  const map = new Map<string, FundPeriodReturns>();
  for (const row of latestRows) {
    const code = row.fund_code.toUpperCase();
    map.set(code, computeForFund(code, row.price_date, row.price));
  }

  cachedReturns = { at: now, map };
  return map;
}

export function invalidateReturnsCache(): void {
  cachedReturns = null;
}

export function mergeReturns(
  primary: FundPeriodReturns,
  fallback: FundPeriodReturns | undefined
): FundPeriodReturns {
  if (!fallback) return primary;
  return {
    m1: primary.m1 ?? fallback.m1,
    m3: primary.m3 ?? fallback.m3,
    m6: primary.m6 ?? fallback.m6,
    ytd: primary.ytd ?? fallback.ytd,
    y1: primary.y1 ?? fallback.y1,
    y3: primary.y3 ?? fallback.y3,
    y5: primary.y5 ?? fallback.y5,
  };
}
