import db from './db';

export type HeatmapTag = 'yellow' | 'blue' | 'red';

/** Calendar days before range start to load prior NAV for the first trading day. */
const LOOKBACK_CALENDAR_DAYS = 90;

export interface HeatmapCell {
  pct: number;
  price: number;
  prevDate: string;
  prevPrice: number;
  tag: HeatmapTag;
}

export interface FonbulHeatmapSummary {
  yellow: number;
  red: number;
  blue: number;
  generalTotal: number;
  last15: number;
  first15: number;
}

export interface FonbulHeatmapPricePoint {
  date: string;
  price: number;
}

/** Calendar days before each fund's latest price — covers 1Y + holiday gaps. */
const PERIODIC_LOOKBACK_DAYS = 400;

export interface FonbulHeatmapResponse {
  rangeStart: string;
  rangeEnd: string;
  rangeLabel: string;
  dates: string[];
  fundCodes: string[];
  rows: Array<{
    date: string;
    cells: Array<HeatmapCell | null>;
  }>;
  summary: FonbulHeatmapSummary[];
  /** Ascending price series per fund (parallel to fundCodes) for period-return footer. */
  fundPrices: FonbulHeatmapPricePoint[][];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function daysBeforeIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - days);
  return isoDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

const MONTH_NAMES_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1) return null;
  const maxDay = new Date(year, month, 0).getDate();
  if (day > maxDay) return null;
  return { year, month, day };
}

function formatDateTr(iso: string): string {
  const parts = parseIsoDate(iso);
  if (!parts) return iso;
  return `${parts.day} ${MONTH_NAMES_TR[parts.month - 1]} ${parts.year}`;
}

function rangeLabelTr(startIso: string, endIso: string): string {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return `${startIso} – ${endIso}`;
  if (start.year === end.year && start.month === end.month) {
    return `${MONTH_NAMES_TR[start.month - 1]} ${start.year}`;
  }
  return `${formatDateTr(startIso)} – ${formatDateTr(endIso)}`;
}

function assignTercileTags(
  entries: Array<{ fundIdx: number; pct: number }>
): Map<number, HeatmapTag> {
  const tags = new Map<number, HeatmapTag>();
  const n = entries.length;
  if (n === 0) return tags;

  const sorted = [...entries].sort((a, b) => b.pct - a.pct);
  const third = Math.ceil(n / 3);
  const yellowEnd = third;
  const redStart = n - third;

  sorted.forEach((entry, rank) => {
    if (rank < yellowEnd) tags.set(entry.fundIdx, 'yellow');
    else if (rank >= redStart) tags.set(entry.fundIdx, 'red');
    else tags.set(entry.fundIdx, 'blue');
  });

  return tags;
}

/** Collapse duplicate dates per fund (keep last price) and sort ascending. */
function normalizeSeries(
  points: Array<{ date: string; price: number }>
): Array<{ date: string; price: number }> {
  const byDate = new Map<string, number>();
  for (const p of points) {
    if (!Number.isFinite(p.price) || p.price <= 0) continue;
    byDate.set(p.date, p.price);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, price }));
}

export function getFonbulHeatmap(startDate: string, endDate: string): FonbulHeatmapResponse {
  const startParts = parseIsoDate(startDate);
  const endParts = parseIsoDate(endDate);
  if (!startParts || !endParts) {
    throw new Error('Geçersiz tarih formatı (YYYY-MM-DD bekleniyor).');
  }
  if (startDate > endDate) {
    throw new Error('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
  }

  const periodStart = startDate;
  const periodEnd = endDate;
  const priceRangeStart = daysBeforeIso(periodStart, LOOKBACK_CALENDAR_DAYS);
  const priceRangeEnd = periodEnd;

  const priceRows = db
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
    .all(priceRangeStart, priceRangeEnd) as Array<{
    fund_code: string;
    price_date: string;
    price: number;
  }>;

  const fundsInPeriod = new Set(
    priceRows
      .filter((r) => r.price_date >= periodStart && r.price_date <= periodEnd)
      .map((r) => r.fund_code)
  );

  const fundCodes = [...fundsInPeriod].sort((a, b) => a.localeCompare(b, 'tr-TR'));
  const fundIndex = new Map(fundCodes.map((code, idx) => [code, idx]));

  const rawSeries = new Map<string, Array<{ date: string; price: number }>>();
  for (const row of priceRows) {
    if (!fundsInPeriod.has(row.fund_code)) continue;
    let arr = rawSeries.get(row.fund_code);
    if (!arr) {
      arr = [];
      rawSeries.set(row.fund_code, arr);
    }
    arr.push({ date: row.price_date, price: row.price });
  }

  const dailyPct = new Map<string, Array<HeatmapCell | null>>();
  const dateCoverage = new Map<string, number>();

  for (const code of fundCodes) {
    const idx = fundIndex.get(code);
    if (idx == null) continue;

    const points = normalizeSeries(rawSeries.get(code) ?? []);
    for (let i = 0; i < points.length; i++) {
      const today = points[i];
      if (today.date < periodStart || today.date > periodEnd) continue;

      const prev = i > 0 ? points[i - 1] : null;
      if (!prev || prev.price <= 0) continue;

      const pct = ((today.price - prev.price) / prev.price) * 100;
      if (!Number.isFinite(pct)) continue;

      let row = dailyPct.get(today.date);
      if (!row) {
        row = new Array(fundCodes.length).fill(null);
        dailyPct.set(today.date, row);
      }

      row[idx] = {
        pct,
        price: today.price,
        prevDate: prev.date,
        prevPrice: prev.price,
        tag: 'blue',
      };
      dateCoverage.set(today.date, (dateCoverage.get(today.date) ?? 0) + 1);
    }
  }

  const minFundsPerDate = Math.min(
    fundCodes.length,
    Math.max(5, Math.floor(fundCodes.length * 0.25))
  );
  const dates = [...dailyPct.keys()]
    .filter((date) => (dateCoverage.get(date) ?? 0) >= minFundsPerDate)
    .sort();

  const rows: FonbulHeatmapResponse['rows'] = [];

  for (const date of dates) {
    const cells = dailyPct.get(date) ?? new Array(fundCodes.length).fill(null);
    const entries: Array<{ fundIdx: number; pct: number }> = [];

    cells.forEach((cell, fundIdx) => {
      if (cell != null && Number.isFinite(cell.pct)) {
        entries.push({ fundIdx, pct: cell.pct });
      }
    });

    const tags = assignTercileTags(entries);
    const taggedCells: Array<HeatmapCell | null> = cells.map((cell, fundIdx) => {
      if (cell == null || !Number.isFinite(cell.pct)) return null;
      const tag = tags.get(fundIdx);
      if (!tag) return null;
      return { ...cell, tag };
    });

    rows.push({ date, cells: taggedCells });
  }

  const summary: FonbulHeatmapSummary[] = fundCodes.map(() => ({
    yellow: 0,
    red: 0,
    blue: 0,
    generalTotal: 0,
    last15: 0,
    first15: 0,
  }));

  const first15Dates = new Set(dates.slice(0, 15));
  const last15Dates = new Set(dates.slice(-15));

  for (const row of rows) {
    const inFirst15 = first15Dates.has(row.date);
    const inLast15 = last15Dates.has(row.date);

    row.cells.forEach((cell, fundIdx) => {
      if (!cell) return;
      const s = summary[fundIdx];
      if (cell.tag === 'yellow') s.yellow += 1;
      else if (cell.tag === 'red') s.red += 1;
      else s.blue += 1;
      s.generalTotal += cell.pct;
      if (inFirst15) s.first15 += cell.pct;
      if (inLast15) s.last15 += cell.pct;
    });
  }

  const fundPrices: FonbulHeatmapPricePoint[][] = fundCodes.map(() => []);

  if (fundCodes.length > 0) {
    const placeholders = fundCodes.map(() => '?').join(',');
    const lookbackRows = db
      .prepare(
        `WITH fund_latest AS (
           SELECT fund_code, MAX(price_date) AS max_date
           FROM price_history
           WHERE fund_code IN (${placeholders})
           GROUP BY fund_code
         )
         SELECT ph.fund_code, ph.price_date, ph.price
         FROM price_history ph
         INNER JOIN fund_latest fl ON fl.fund_code = ph.fund_code
         WHERE ph.price_date >= date(fl.max_date, '-${PERIODIC_LOOKBACK_DAYS} days')
           AND ph.price IS NOT NULL
           AND ph.price > 0
         ORDER BY ph.fund_code ASC, ph.price_date ASC`
      )
      .all(...fundCodes) as Array<{
      fund_code: string;
      price_date: string;
      price: number;
    }>;

    for (const row of lookbackRows) {
      const idx = fundIndex.get(row.fund_code);
      if (idx == null) continue;
      fundPrices[idx].push({ date: row.price_date, price: row.price });
    }
  }

  return {
    rangeStart: periodStart,
    rangeEnd: periodEnd,
    rangeLabel: rangeLabelTr(periodStart, periodEnd),
    dates,
    fundCodes,
    rows,
    summary,
    fundPrices,
  };
}
