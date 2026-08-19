/**
 * FVT (fvt.com.tr) fund portfolio distribution.
 *
 * Weights come from `GET /api/funds/{code}/distribution`.
 * Getiri % mirrors FVT's UI logic:
 *   - Nested 3-letter funds (BYF/Fonlar): live `/api/funds/{ticker}` getiri
 *   - Yerli hisseler: `oranCanli` → `oran` → `degisimCanli` → `degisim` (Getiri % column)
 * Live BIST % is often absent from the distribution payload; the client falls back to
 * İş Yatırım/TEFAS only when FVT returns null.
 */

const FVT_API_BASE = 'https://fvt.com.tr/api/funds';

const PAGE_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  Referer: 'https://fvt.com.tr/fonlar/yatirim-fonlari/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const TICKER_RE = /^[A-Z0-9]{2,6}$/;

import { fetchFvtDailyEstimate } from './fvt-guess';

export interface FvtPortfolioHolding {
  ticker: string;
  weight: number;
  /** null when FVT did not supply Getiri % — client may fallback. */
  dailyChange: number | null;
  source: string;
}

export interface FvtPortfolioResult {
  holdings: FvtPortfolioHolding[];
  /** FVT "Günün Tahmini" from guess WebSocket; null when unavailable. */
  dailyEstimate: number | null;
}

interface FvtDistributionRow {
  hisseKodu?: unknown;
  agirlik?: unknown;
  oran?: unknown;
  oranCanli?: unknown;
  degisim?: unknown;
  degisimCanli?: unknown;
  fonGetiri?: unknown;
  fonAdi2?: unknown;
  hisseKategori?: unknown;
  yabanci?: unknown;
  etf?: unknown;
}

interface FvtDistributionResponse {
  success?: boolean;
  data?: {
    items?: FvtDistributionRow[];
    meta?: { aciklamaTarihi?: string };
  };
}

interface FvtFundDetailResponse {
  data?: {
    fund?: { getiri?: unknown };
  };
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw).trim().replace(/%/g, '').replace(/,/g, '.');
  if (!text || text === '-') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Nested mutual-fund position (PKZ, PCS, …) — FVT uses fon getiri, not stock stream. */
function isNestedFundRow(row: FvtDistributionRow): boolean {
  const ticker =
    typeof row.hisseKodu === 'string' ? row.hisseKodu.trim().toUpperCase() : '';
  const hasFundName = typeof row.fonAdi2 === 'string' && row.fonAdi2.trim().length > 0;
  return hasFundName && ticker.length <= 3;
}

/**
 * Getiri % from distribution row — matches FVT table column order for stocks:
 * oranCanli / oran (Getiri %) before legacy degisim fields.
 */
function pickStockGetiriFromDistribution(row: FvtDistributionRow): number | null {
  for (const raw of [row.oranCanli, row.oran, row.degisimCanli, row.degisim]) {
    const value = parseNumber(raw);
    if (value != null && value !== 0) return roundTo2(value);
  }
  return null;
}

async function fetchLiveFundGetiri(fundCode: string): Promise<number | null> {
  const code = fundCode.trim().toUpperCase();
  const response = await fetch(`${FVT_API_BASE}/${encodeURIComponent(code)}`, {
    method: 'GET',
    headers: PAGE_HEADERS,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as FvtFundDetailResponse;
  const value = parseNumber(payload?.data?.fund?.getiri);
  return value == null ? null : roundTo2(value);
}

async function fetchLiveFundGetiriMap(codes: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (code) => {
      const getiri = await fetchLiveFundGetiri(code);
      return getiri == null ? null : ([code, getiri] as const);
    })
  );

  const map = new Map<string, number>();
  for (const entry of entries) {
    if (entry) map.set(entry[0], entry[1]);
  }
  return map;
}

function mapRow(
  row: FvtDistributionRow,
  liveFundGetiri: Map<string, number>
): FvtPortfolioHolding | null {
  const ticker =
    typeof row.hisseKodu === 'string' ? row.hisseKodu.trim().toUpperCase() : '';
  if (!TICKER_RE.test(ticker)) return null;

  const weight = parseNumber(row.agirlik);
  if (weight == null || weight <= 0) return null;

  let dailyChange: number | null = null;

  if (isNestedFundRow(row)) {
    dailyChange =
      liveFundGetiri.get(ticker) ??
      parseNumber(row.fonGetiri) ??
      null;
    if (dailyChange != null) dailyChange = roundTo2(dailyChange);
  } else {
    dailyChange = pickStockGetiriFromDistribution(row);
  }

  return {
    ticker,
    weight: roundTo2(weight),
    dailyChange,
    source: dailyChange == null ? 'FVT' : 'FVT',
  };
}

export async function fetchFvtPortfolio(fundCode: string): Promise<FvtPortfolioResult> {
  const code = fundCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(code)) {
    throw new Error('Geçerli bir fon kodu girin.');
  }

  const [distributionResult, dailyEstimate] = await Promise.all([
    fetchFvtDistributionHoldings(code),
    fetchFvtDailyEstimate(code),
  ]);

  return {
    holdings: distributionResult,
    dailyEstimate,
  };
}

async function fetchFvtDistributionHoldings(code: string): Promise<FvtPortfolioHolding[]> {
  const url = `${FVT_API_BASE}/${encodeURIComponent(code)}/distribution`;
  const response = await fetch(url, {
    method: 'GET',
    headers: PAGE_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`FVT isteği başarısız: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as FvtDistributionResponse;
  const items = payload?.data?.items;
  if (!Array.isArray(items)) {
    throw new Error('FVT yanıtı beklenmeyen formatta.');
  }

  const activeRows = items.filter((row) => {
    const weight = parseNumber(row.agirlik);
    return weight != null && weight > 0;
  });

  const nestedFundCodes = activeRows
    .filter(isNestedFundRow)
    .map((row) => String(row.hisseKodu).trim().toUpperCase());

  const liveFundGetiri = await fetchLiveFundGetiriMap(nestedFundCodes);

  const holdings: FvtPortfolioHolding[] = [];
  const seen = new Set<string>();

  for (const row of activeRows) {
    const holding = mapRow(row, liveFundGetiri);
    if (!holding || seen.has(holding.ticker)) continue;
    seen.add(holding.ticker);
    holdings.push(holding);
  }

  holdings.sort((a, b) => b.weight - a.weight);

  if (holdings.length === 0) {
    throw new Error(`${code} için portföy dağılımı bulunamadı.`);
  }

  return holdings;
}