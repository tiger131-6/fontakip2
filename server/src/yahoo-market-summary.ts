/**
 * Yahoo Finance chart API — market summary quotes (server-side proxy avoids browser CORS).
 */

const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

export interface MarketSummaryQuote {
  price: string;
  change: number;
}

export interface MarketSummaryResult {
  bist: MarketSummaryQuote | null;
  usd: MarketSummaryQuote | null;
  eur: MarketSummaryQuote | null;
  gold: MarketSummaryQuote | null;
  fetchedAt: string;
}

const SUMMARY_SYMBOLS = [
  { key: 'bist' as const, symbol: 'XU100.IS' },
  { key: 'usd' as const, symbol: 'TRY=X' },
  { key: 'eur' as const, symbol: 'EURTRY=X' },
  { key: 'gold' as const, symbol: 'GC=F' },
];

async function fetchYahooQuote(symbol: string): Promise<MarketSummaryQuote | null> {
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d&_=${Date.now()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...YAHOO_HEADERS,
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    },
  } as RequestInit);

  if (!response.ok) return null;

  const data = (await response.json()) as {
    chart?: {
      result?: Array<{
        meta?: { chartPreviousClose?: number; regularMarketPrice?: number };
      }>;
    };
  };

  const prev = data?.chart?.result?.[0]?.meta?.chartPreviousClose;
  const curr = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (prev == null || curr == null || prev === 0) return null;

  const change = Number((((curr - prev) / prev) * 100).toFixed(2));
  return { price: curr.toFixed(2), change };
}

/** BIST 100, USD/TRY, EUR/TRY, spot gold — parallel Yahoo chart fetch. */
export async function fetchMarketSummary(): Promise<MarketSummaryResult> {
  const entries = await Promise.all(
    SUMMARY_SYMBOLS.map(async ({ key, symbol }) => {
      try {
        const quote = await fetchYahooQuote(symbol);
        return [key, quote] as const;
      } catch {
        return [key, null] as const;
      }
    })
  );

  const result: MarketSummaryResult = {
    bist: null,
    usd: null,
    eur: null,
    gold: null,
    fetchedAt: new Date().toISOString(),
  };

  for (const [key, quote] of entries) {
    result[key] = quote;
  }

  return result;
}
