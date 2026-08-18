import { apiUrl } from '../config/apiBase';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const HISTORY_RANGES = [
  { value: '1d', label: 'Sadece Günlük' },
  { value: '5d', label: '1 Hafta' },
  { value: '1mo', label: '1 Ay' },
  { value: '3mo', label: '3 Ay' },
  { value: '6mo', label: '6 Ay' },
  { value: '1y', label: '1 Yıl' },
] as const;

export type HistoryRange = (typeof HISTORY_RANGES)[number]['value'];

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatChangeString(n: number): string {
  return roundTo2(n).toFixed(2);
}

/** BIST stocks — Yahoo Finance chart API (direct fetch). */
async function fetchHistoricalFromYahoo(
  ticker: string,
  range: string
): Promise<string | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.IS?interval=1d&range=${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    chart?: {
      result?: Array<{
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };

  const result = data?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close?.filter(
    (val): val is number => val != null && Number.isFinite(val)
  );

  if (!closes || closes.length < 2) return null;

  const earliestClose = closes[0];
  const latestClose = closes[closes.length - 1];
  if (earliestClose === 0) return null;

  const changePercent = ((latestClose - earliestClose) / earliestClose) * 100;
  return formatChangeString(changePercent);
}

/** TEFAS mutual funds — bundled Express proxy (NAV series). */
async function fetchHistoricalFromTefas(
  fundCode: string,
  range: string
): Promise<string | null> {
  const response = await fetch(
    apiUrl(
      `/market/tefas-historical-change/${encodeURIComponent(fundCode)}?range=${encodeURIComponent(range)}`
    ),
    { method: 'GET', headers: { Accept: 'application/json' } }
  );
  if (!response.ok) return null;

  const data = (await response.json()) as { historicalChange?: unknown };
  const change = Number(data.historicalChange);
  if (!Number.isFinite(change)) return null;
  return formatChangeString(change);
}

/**
 * Cumulative % change over a Yahoo-compatible range.
 * Returns null for `1d` (daily-only mode) or when data is unavailable.
 */
export async function fetchHistoricalStockChange(
  ticker: string,
  range: string
): Promise<string | null> {
  if (range === '1d') return null;

  const code = ticker.trim().toUpperCase();
  if (!code) return null;

  try {
    if (code.length === 3) {
      return await fetchHistoricalFromTefas(code, range);
    }
    return await fetchHistoricalFromYahoo(code, range);
  } catch (error) {
    console.warn(`Historical fetch failed for ${code} (${range}):`, error);
    return null;
  }
}

export function historyRangeLabel(range: string): string {
  return HISTORY_RANGES.find((r) => r.value === range)?.label ?? range;
}
