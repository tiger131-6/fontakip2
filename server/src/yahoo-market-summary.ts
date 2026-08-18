/**
 * Market summary quotes — Yahoo Finance for BIST/FX, Yapı Kredi for gram altın.
 */

import { fetchGramGoldPrice, getPreviousGoldBuyPrice } from './gold-price';

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

const YAHOO_SYMBOLS = [
  { key: 'bist' as const, symbol: 'XU100.IS' },
  { key: 'usd' as const, symbol: 'TRY=X' },
  { key: 'eur' as const, symbol: 'EURTRY=X' },
] as const;

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

async function fetchGramGoldSummaryQuote(): Promise<MarketSummaryQuote | null> {
  try {
    const quote = await fetchGramGoldPrice();
    const buyPrice = quote.buyPrice;
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) return null;

    const today = quote.fetchedAt.slice(0, 10);
    const prev = getPreviousGoldBuyPrice(today);
    let change = 0;
    if (prev != null && prev > 0) {
      change = Number((((buyPrice - prev) / prev) * 100).toFixed(2));
    }

    return { price: buyPrice.toFixed(2), change };
  } catch {
    return null;
  }
}

/** BIST 100, USD/TRY, EUR/TRY (Yahoo) + gram altın (Yapı Kredi). */
export async function fetchMarketSummary(): Promise<MarketSummaryResult> {
  const yahooEntries = await Promise.all(
    YAHOO_SYMBOLS.map(async ({ key, symbol }) => {
      try {
        const quote = await fetchYahooQuote(symbol);
        return [key, quote] as const;
      } catch {
        return [key, null] as const;
      }
    })
  );

  const gold = await fetchGramGoldSummaryQuote();

  const result: MarketSummaryResult = {
    bist: null,
    usd: null,
    eur: null,
    gold: null,
    fetchedAt: new Date().toISOString(),
  };

  for (const [key, quote] of yahooEntries) {
    result[key] = quote;
  }
  result.gold = gold;

  return result;
}
