import db, { type FundRow } from './db';
import { extractFundTitleType } from './fund-title-type';
import { loadFundFundamentalsMap, type FundMetrics } from './fund-fundamentals';
import { loadFundRiskMap } from './fund-risk';
import { fetchTefasFundOverview } from './tefas';
import { loadReturnsFromDb, mergeReturns } from './fund-returns-db';
import { resolveUmbrellaType } from './umbrella-type';

const stmtUpsertUmbrella = db.prepare(
  'UPDATE funds SET umbrella_type = ? WHERE fund_code = ?'
);

function persistUmbrellaTypes(entries: Array<{ code: string; umbrellaType: string }>): void {
  const txn = db.transaction(() => {
    for (const entry of entries) {
      const label = entry.umbrellaType.trim();
      if (!label || label === '—') continue;
      stmtUpsertUmbrella.run(label, entry.code);
    }
  });
  txn();
}

const CACHE_TTL_MS = 30 * 60 * 1000;
let cache: { at: number; data: FundOverviewResponse } | null = null;

const stmtAllFunds = db.prepare<[], FundRow>(
  'SELECT fund_code, fund_name, is_tax_free, is_active, umbrella_type FROM funds ORDER BY fund_code ASC'
);

export interface FundTableRow {
  fund_code: string;
  fund_name: string;
  is_tax_free: 0 | 1;
  is_active: 0 | 1;
  is_favorite: boolean;
  umbrella_type: string;
  title_type: string;
  metrics: FundMetrics;
  returns: {
    m1: number | null;
    m3: number | null;
    m6: number | null;
    ytd: number | null;
    y1: number | null;
    y3: number | null;
    y5: number | null;
  };
}

export interface FundOverviewMeta {
  tefasCount: number;
  dbCount: number;
  rowCount: number;
  /** DB funds not on the official TEFAS 1014 list (excluded from the table). */
  dbOnlyCodes: string[];
  /** TEFAS funds missing from local DB. */
  tefasOnlyCodes: string[];
}

export interface FundOverviewResponse {
  rows: FundTableRow[];
  meta: FundOverviewMeta;
  cached: boolean;
  fetchedAt: string;
}

function favoriteCodes(): Set<string> {
  const rows = db.prepare('SELECT fund_code FROM watchlist').all() as Array<{ fund_code: string }>;
  return new Set(rows.map((r) => r.fund_code));
}

const EMPTY_METRICS: FundMetrics = {
  investor_count: null,
  portfolio_value: null,
  investor_growth_1m: null,
  negative_months: null,
  volatility: null,
};

function applyFavorites(rows: FundTableRow[]): FundTableRow[] {
  const favorites = favoriteCodes();
  return rows.map((r) => ({ ...r, is_favorite: favorites.has(r.fund_code) }));
}

function attachFundamentals(rows: Omit<FundTableRow, 'metrics'>[]): FundTableRow[] {
  const fundamentals = loadFundFundamentalsMap();
  const risk = loadFundRiskMap();
  return rows.map((r) => {
    const base = fundamentals.get(r.fund_code);
    const rk = risk.get(r.fund_code);
    return {
      ...r,
      metrics: {
        investor_count: base?.investor_count ?? null,
        portfolio_value: base?.portfolio_value ?? null,
        investor_growth_1m: base?.investor_growth_1m ?? null,
        negative_months: rk?.negative_months ?? null,
        volatility: rk?.volatility ?? null,
      },
    };
  });
}

function finalizeRows(rows: Omit<FundTableRow, 'metrics'>[]): FundTableRow[] {
  return applyFavorites(attachFundamentals(rows));
}

const EMPTY_RETURNS: FundTableRow['returns'] = {
  m1: null,
  m3: null,
  m6: null,
  ytd: null,
  y1: null,
  y3: null,
  y5: null,
};

function applyDbReturnFallback(rows: Omit<FundTableRow, 'metrics'>[]): Omit<FundTableRow, 'metrics'>[] {
  const dbReturns = loadReturnsFromDb();
  return rows.map((row) => ({
    ...row,
    umbrella_type: resolveUmbrellaType(row.umbrella_type, row.fund_name),
    returns: mergeReturns(row.returns, dbReturns.get(row.fund_code)),
  }));
}

function buildDbOnlyOverview(dbFunds: FundRow[]): FundOverviewResponse {
  const dbReturns = loadReturnsFromDb();
  const rows: Omit<FundTableRow, 'metrics'>[] = dbFunds
    .filter((f) => f.fund_code !== 'ALTIN')
    .map((f) => ({
      fund_code: f.fund_code,
      fund_name: f.fund_name,
      is_tax_free: (f.is_tax_free === 1 ? 1 : 0) as 0 | 1,
      is_active: (f.is_active === 0 ? 0 : 1) as 0 | 1,
      is_favorite: false,
      umbrella_type: resolveUmbrellaType(f.umbrella_type, f.fund_name),
      title_type: extractFundTitleType(f.fund_name),
      returns: dbReturns.get(f.fund_code) ?? { ...EMPTY_RETURNS },
    }))
    .sort((a, b) => a.fund_code.localeCompare(b.fund_code, 'tr-TR'));

  return {
    rows: finalizeRows(rows),
    meta: {
      tefasCount: 0,
      dbCount: dbFunds.length,
      rowCount: rows.length,
      dbOnlyCodes: [],
      tefasOnlyCodes: [],
    },
    cached: false,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getFundOverview(forceRefresh = false): Promise<FundOverviewResponse> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.at < CACHE_TTL_MS) {
    return {
      ...cache.data,
      rows: applyFavorites(cache.data.rows),
      cached: true,
    };
  }

  // Normal navigation: serve local DB instantly — do not block on TEFAS.
  if (!forceRefresh) {
    const data = buildDbOnlyOverview(stmtAllFunds.all());
    cache = { at: now, data };
    return { ...data, cached: true };
  }

  try {
    const tefasRows = await fetchTefasFundOverview(['YAT'], { timeoutMs: 12_000 }).catch(
      () => null
    );

    if (!tefasRows?.length) {
      console.warn('[fund-overview] TEFAS unavailable on refresh, serving DB data.');
      const data = buildDbOnlyOverview(stmtAllFunds.all());
      cache = { at: now, data };
      return data;
    }

    const dbFunds = stmtAllFunds.all();

    const dbMap = new Map(dbFunds.map((f) => [f.fund_code, f]));
    const tefasCodes = new Set(tefasRows.map((r) => r.code));

    const dbOnlyCodes = dbFunds
      .filter((f) => !tefasCodes.has(f.fund_code))
      .map((f) => f.fund_code);

    const tefasOnlyCodes = tefasRows
      .filter((r) => !dbMap.has(r.code))
      .map((r) => r.code);

    const rows: Omit<FundTableRow, 'metrics'>[] = applyDbReturnFallback(
      tefasRows
        .map((t) => {
          const local = dbMap.get(t.code);
          return {
            fund_code: t.code,
            fund_name: t.name,
            is_tax_free: (local?.is_tax_free === 1 ? 1 : 0) as 0 | 1,
            is_active: (local?.is_active === 0 ? 0 : 1) as 0 | 1,
            is_favorite: false,
            umbrella_type: resolveUmbrellaType(
              t.umbrellaType !== '—' ? t.umbrellaType : local?.umbrella_type,
              t.name
            ),
            title_type: extractFundTitleType(t.name),
            returns: t.returns,
          };
        })
        .sort((a, b) => a.fund_code.localeCompare(b.fund_code, 'tr-TR'))
    );

    persistUmbrellaTypes(
      tefasRows.map((t) => ({ code: t.code, umbrellaType: t.umbrellaType }))
    );

    const data: FundOverviewResponse = {
      rows: finalizeRows(rows),
      meta: {
        tefasCount: tefasRows.length,
        dbCount: dbFunds.length,
        rowCount: rows.length,
        dbOnlyCodes,
        tefasOnlyCodes,
      },
      cached: false,
      fetchedAt: new Date().toISOString(),
    };

    cache = { at: now, data };
    return data;
  } catch (err) {
    if (cache) {
      console.warn('[fund-overview] TEFAS failed on refresh, serving stale cache:', err);
      return {
        ...cache.data,
        rows: applyFavorites(cache.data.rows),
        cached: true,
      };
    }

    console.warn('[fund-overview] TEFAS failed on refresh, serving DB-only fallback:', err);
    return buildDbOnlyOverview(stmtAllFunds.all());
  }
}
