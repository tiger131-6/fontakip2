import { apiUrl } from '../config/apiBase';
import { fetchTefasFundDailyChange } from './tefasDailyChange';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface StockDailyChangeResult {
  value: string;
  source: string;
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatChangeValue(n: number): string {
  return roundTo2(n).toFixed(2);
}

function parsePercent(raw: unknown): number | null {
  if (raw == null) return null;
  const text = String(raw)
    .trim()
    .replace(/%/g, '')
    .replace(/\+/g, '')
    .replace(/,/g, '.');
  const value = Number(text);
  return Number.isFinite(value) ? roundTo2(value) : null;
}

function logResult(code: string, result: StockDailyChangeResult): StockDailyChangeResult {
  console.log(`[DailyChange] ${code} = ${result.value}% via ${result.source}`);
  return result;
}

function parseBigparaDailyChangePercent(html: string): number | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const kurDetailEl = doc.querySelector(
    '.kurDetail .valueDown, .kurDetail .valueUp, .kurDetail .valueEq, .change, .d-deger'
  );
  const kurDetailParsed = parsePercent(kurDetailEl?.textContent);
  if (kurDetailParsed != null) return kurDetailParsed;

  for (const item of doc.querySelectorAll('.information-list__item')) {
    const label = item.querySelector('.name')?.textContent ?? '';
    if (!label.includes('Günlük Değişim %')) continue;
    const valueEl = item.querySelector('.value[data-role="p"], .value');
    const parsed = parsePercent(valueEl?.textContent);
    if (parsed != null) return parsed;
  }

  const headerRate = doc.querySelector('.sym__rate span:not(.sym__rate-icon)');
  const headerParsed = parsePercent(headerRate?.textContent);
  if (headerParsed != null) return headerParsed;

  const pcp = doc.querySelector('[data-role="pcp"]');
  const pcpParsed = parsePercent(pcp?.textContent);
  if (pcpParsed != null) return pcpParsed;

  return null;
}

function bigparaDetailUrls(ticker: string): string[] {
  const code = ticker.trim().toLowerCase().replace(/\.is$/i, '');
  return [
    `https://bigpara.hurriyet.com.tr/borsa/hisse-detay/${code}/`,
    `https://bigpara.hurriyet.com.tr/borsa/hisse-fiyatlari/${code}-detay/`,
  ];
}

/** Fallback 2 — Bigpara HTML scrape (last resort; CORS-friendly). */
async function fetchFromBigpara(ticker: string): Promise<number | null> {
  for (const url of bigparaDetailUrls(ticker)) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          'User-Agent': UA,
        },
      });
      if (!response.ok) continue;

      const html = await response.text();
      const parsed = parseBigparaDailyChangePercent(html);
      if (parsed != null) return parsed;
    } catch {
      // try next URL
    }
  }

  console.warn(`[API] Bigpara failed for ${ticker}, falling back...`);
  return null;
}

/** Primary — İş Yatırım JSON (bundled Express proxy; cache-busted). */
async function fetchFromIsYatirim(ticker: string): Promise<number | null> {
  try {
    const response = await fetch(
      apiUrl(
        `/market/bist-daily-change/${encodeURIComponent(ticker)}?_=${Date.now()}`
      ),
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;

    const data = (await response.json()) as { dailyChange?: unknown };
    const change = Number(data.dailyChange);
    if (!Number.isFinite(change)) return null;
    return roundTo2(change);
  } catch {
    console.warn(`[API] İş Yatırım failed for ${ticker}, falling back...`);
    return null;
  }
}

/** Fallback 1 — Yahoo Finance chart API (BIST tickers as `{CODE}.IS`). */
async function fetchFromYahoo(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.IS?interval=1d&range=1d`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      chart?: { result?: Array<{ meta?: { chartPreviousClose?: number; regularMarketPrice?: number } }> };
    };
    const meta = data?.chart?.result?.[0]?.meta;
    const prev = meta?.chartPreviousClose;
    const curr = meta?.regularMarketPrice;
    if (prev == null || curr == null || prev === 0) return null;

    return roundTo2(((curr - prev) / prev) * 100);
  } catch {
    console.warn(`[API] Yahoo failed for ${ticker}, falling back...`);
    return null;
  }
}

export function dailyChangeSourceLabel(source: string): string {
  switch (source) {
    case 'ISYATIRIM':
      return 'İş Yatırım';
    case 'YAHOO':
      return 'Yahoo';
    case 'BIGPARA':
      return 'Bigpara';
    case 'TEFAS':
      return 'TEFAS';
    case 'FAILED':
      return 'Başarısız';
    default:
      return source;
  }
}

/**
 * Smart router + fallback chain for daily % change.
 * Returns both the value and which provider supplied it (for debugging).
 * - 3-letter codes → TEFAS mutual funds
 * - 4–5 letter codes → İş Yatırım → Yahoo → Bigpara
 */
export async function fetchStockDailyChange(ticker: string): Promise<StockDailyChangeResult> {
  const code = ticker.trim().toUpperCase();
  if (!code) throw new Error('Geçerli bir hisse kodu girin.');

  if (code.length === 3) {
    console.log(`[Router] ${code} is a Mutual Fund. Routing to TEFAS...`);
    const val = await fetchTefasFundDailyChange(code);
    return logResult(code, { value: formatChangeValue(val), source: 'TEFAS' });
  }

  const isyatirim = await fetchFromIsYatirim(code);
  if (isyatirim != null && Number.isFinite(isyatirim)) {
    return logResult(code, { value: formatChangeValue(isyatirim), source: 'ISYATIRIM' });
  }

  const yahoo = await fetchFromYahoo(code);
  if (yahoo != null && Number.isFinite(yahoo)) {
    return logResult(code, { value: formatChangeValue(yahoo), source: 'YAHOO' });
  }

  const bigpara = await fetchFromBigpara(code);
  if (bigpara != null && Number.isFinite(bigpara)) {
    return logResult(code, { value: formatChangeValue(bigpara), source: 'BIGPARA' });
  }

  console.error(`[DailyChange] All providers failed for ${code}`);
  return { value: '0.00', source: 'FAILED' };
}
