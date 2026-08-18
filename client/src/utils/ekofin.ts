const EKOFIN_API_BASE = 'https://api.ekofin.net';

export interface EkofinHolding {
  ticker: string;
  weight: number;
}

/** Raw row from Ekofin's historical-distribution endpoint (fields are ALL_CAPS). */
interface EkofinDistributionRow {
  HISSE_ADI?: unknown;
  PORTFOY_ORAN?: unknown;
  DONEM_TARIHI?: unknown;
  TYPE?: unknown;
}

function isPortfolioTicker(ticker: string): boolean {
  return /^[A-Z]{3,5}$/.test(ticker);
}

function isIncludedHoldingType(type: unknown): boolean {
  const t = String(type).toUpperCase();
  return t === 'STOCK' || t === 'FUND';
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Fetch a fund's current stock composition (tickers + weights) from Ekofin.
 *
 * Why the JSON API instead of scraping the HTML page: ekofin.net is a Next.js
 * SPA, so `https://ekofin.net/fonlar/detay/{code}/fon-portfoy` ships an empty
 * shell (no <table> — the holdings hydrate client-side). We call the same
 * public, unauthenticated API its frontend uses. Cloudflare returns
 * `Access-Control-Allow-Origin: *`, so a direct browser/Electron fetch works
 * without CORS or a proxy.
 *
 * The endpoint returns *monthly* KAP snapshots for every holding across many
 * periods, e.g.:
 *   { HISSE_ADI: "THYAO", PORTFOY_ORAN: 8.36, DONEM_TARIHI: "2026-06-01T00:00:00", TYPE: "STOCK" }
 *   { HISSE_ADI: "PKZ",   PORTFOY_ORAN: 10.46, DONEM_TARIHI: "2026-05-01T00:00:00", TYPE: "FUND" }
 * We keep the latest period and both BIST stocks (STOCK) and nested mutual funds
 * (FUND) whose codes match /^[A-Z]{3,5}$/ (3-letter TEFAS codes + 4–5 letter stocks).
 */
export async function scrapeFundCompositionFromEkofin(fundCode: string): Promise<EkofinHolding[]> {
  const code = fundCode.trim().toUpperCase();
  if (!code) throw new Error('Geçerli bir fon kodu girin.');

  const url = `${EKOFIN_API_BASE}/api/fund-information/historical-distribution?fonKodu=${encodeURIComponent(code)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Ekofin isteği başarısız: HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Ekofin yanıtı beklenmeyen formatta.');
  }
  const rows = payload as EkofinDistributionRow[];

  // Most recent snapshot across all rows. ISO date strings ("2026-06-01T…")
  // are fixed-width, so lexicographic comparison matches chronological order.
  let latestPeriod = '';
  for (const row of rows) {
    if (typeof row.DONEM_TARIHI === 'string' && row.DONEM_TARIHI > latestPeriod) {
      latestPeriod = row.DONEM_TARIHI;
    }
  }
  if (!latestPeriod) {
    throw new Error(`${code} için portföy dağılımı bulunamadı.`);
  }

  // Collapse to one weight per ticker (guards against duplicate rows).
  const byTicker = new Map<string, number>();
  for (const row of rows) {
    if (row.DONEM_TARIHI !== latestPeriod) continue;
    if (!isIncludedHoldingType(row.TYPE)) continue;

    const ticker = typeof row.HISSE_ADI === 'string' ? row.HISSE_ADI.trim().toUpperCase() : '';
    if (!isPortfolioTicker(ticker)) continue;

    const weight = Number(row.PORTFOY_ORAN);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    byTicker.set(ticker, Math.max(byTicker.get(ticker) ?? 0, roundTo2(weight)));
  }

  const holdings: EkofinHolding[] = [...byTicker].map(([ticker, weight]) => ({ ticker, weight }));
  holdings.sort((a, b) => b.weight - a.weight);

  if (holdings.length === 0) {
    throw new Error(`${code} için portföy dağılımı bulunamadı.`);
  }

  return holdings;
}
