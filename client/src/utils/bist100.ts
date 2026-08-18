import { apiUrl } from '../config/apiBase';

export interface Bist100StockRow {
  ticker: string;
  last: string;
  buy: string;
  sell: string;
  changePct: string;
  changePctNum: number;
  low: string;
  high: string;
  vwap: string;
  volumeLot: string;
  volumeTl: string;
  lastTradeTime: string;
  direction: 'up' | 'down' | 'flat';
}

export interface Bist100FetchResult {
  rows: Bist100StockRow[];
  fetchedAt: string;
  source: 'proxy' | 'direct';
}

const PAGE_URL = 'https://finans.mynet.com/borsa/canliborsa/';
const NO_CACHE_HEADERS = {
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
} as const;
const TICKER_RE = /^[A-Z]{4,5}$/;

function bustedMynetUrl(): string {
  return `${PAGE_URL}?_=${Date.now()}#XU100`;
}

function parseTurkishPercent(raw: string): number {
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function directionFromChangePct(changePct: string): 'up' | 'down' | 'flat' {
  const n = parseTurkishPercent(changePct);
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}

function directionFrom(raw: string): 'up' | 'down' | 'flat' {
  const n = Number(raw.trim());
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}

function rowFromCleanCells(ticker: string, cleanCells: string[]): Bist100StockRow | null {
  if (cleanCells.length < 10) return null;

  const changePct = cleanCells[4] || '-';
  return {
    ticker,
    last: cleanCells[1] || '-',
    buy: cleanCells[2] || '-',
    sell: cleanCells[3] || '-',
    changePct,
    changePctNum: parseTurkishPercent(changePct),
    low: cleanCells[5] || '-',
    high: cleanCells[6] || '-',
    vwap: cleanCells[7] || '-',
    volumeLot: cleanCells[8] || '-',
    volumeTl: cleanCells[9] || '-',
    lastTradeTime: cleanCells[10] || '-',
    direction: directionFromChangePct(changePct),
  };
}

/**
 * Smart table parser — trim cell text and drop empty/icon-only cells so columns align.
 * Expected after filter: [0] ticker, [1] son … [10] saat.
 */
function parseBist100FromTable(html: string): Bist100StockRow[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parsedStocks: Bist100StockRow[] = [];

  doc.querySelectorAll('table tbody tr').forEach((row) => {
    const firstCell = row.querySelector('td:first-child');
    const tickerLink = firstCell?.querySelector('a');

    if (!tickerLink) return;

    const ticker = tickerLink.textContent?.trim() ?? '';
    if (!TICKER_RE.test(ticker)) return;

    const cells = row.querySelectorAll('td');
    const cleanCells = Array.from(cells)
      .map((cell) => cell.textContent?.trim() ?? '')
      .filter((text) => text !== '');

    const parsed = rowFromCleanCells(ticker, cleanCells);
    if (parsed) parsedStocks.push(parsed);
  });

  parsedStocks.sort((a, b) => a.ticker.localeCompare(b.ticker, 'tr'));
  return parsedStocks;
}

function extractStocksDataBlob(html: string): string {
  const match = html.match(/id="stocksData"[^>]*>([\s\S]*?)<\/script>/i);
  return match?.[1]?.trim() ?? '';
}

function parseStockChunk(chunk: string): Bist100StockRow | null {
  const parts = chunk.replace(/^>/, '').trim().split('|');
  const hIdx = parts.findIndex((p) => /^H\d+$/.test(p));
  if (hIdx < 0) return null;

  const fields = parts.slice(hIdx);
  if (fields.length < 15) return null;

  const ticker = (fields[13] ?? '').trim();
  const indexes = (fields[14] ?? '').trim();
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) return null;
  if (!indexes.startsWith('*') || !indexes.includes('XU100')) return null;

  const changePct = (fields[4] ?? '').trim();
  return {
    ticker,
    last: (fields[1] ?? '').trim(),
    buy: (fields[2] ?? '').trim(),
    sell: (fields[3] ?? '').trim(),
    changePct,
    changePctNum: parseTurkishPercent(changePct),
    low: (fields[8] ?? '').trim(),
    high: (fields[9] ?? '').trim(),
    vwap: (fields[10] ?? '').trim(),
    volumeLot: (fields[11] ?? '').trim(),
    volumeTl: (fields[12] ?? '').trim(),
    lastTradeTime: (fields[5] ?? '').trim(),
    direction: directionFrom(fields[7] || fields[6] || '0'),
  };
}

function parseBist100FromStocksData(html: string): Bist100StockRow[] {
  const blob = extractStocksDataBlob(html);
  if (!blob) return [];

  const rows: Bist100StockRow[] = [];
  for (const chunk of blob.split('|_|')) {
    const row = parseStockChunk(chunk);
    if (row?.ticker) rows.push(row);
  }

  rows.sort((a, b) => a.ticker.localeCompare(b.ticker, 'tr'));
  return rows;
}

function parseBist100FromHtml(html: string): Bist100StockRow[] {
  const fromTable = parseBist100FromTable(html);
  if (fromTable.length >= 50) return fromTable;

  return parseBist100FromStocksData(html);
}

async function fetchViaProxy(): Promise<Bist100StockRow[]> {
  const response = await fetch(apiUrl(`/market/bist100?_=${Date.now()}`), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...NO_CACHE_HEADERS,
    },
  });
  if (!response.ok) throw new Error(`Sunucu HTTP ${response.status}`);
  const data = (await response.json()) as { rows?: Bist100StockRow[] };
  if (!Array.isArray(data.rows) || data.rows.length === 0) {
    throw new Error('Sunucu boş BIST 100 listesi döndürdü.');
  }
  return data.rows;
}

async function fetchViaDirectScrape(): Promise<Bist100StockRow[]> {
  const response = await fetch(bustedMynetUrl(), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'tr-TR,tr;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...NO_CACHE_HEADERS,
    },
  });
  if (!response.ok) throw new Error(`Mynet HTTP ${response.status}`);
  const html = await response.text();
  const rows = parseBist100FromHtml(html);
  if (rows.length === 0) throw new Error('Mynet sayfasında BIST 100 verisi bulunamadı.');
  return rows;
}

/** Manual refresh — tries bundled proxy first, then direct scrape (Electron CORS bypass). */
export async function fetchBist100Quotes(): Promise<Bist100FetchResult> {
  try {
    const rows = await fetchViaProxy();
    return { rows, fetchedAt: new Date().toISOString(), source: 'proxy' };
  } catch (proxyError) {
    console.warn('[BIST100] Proxy failed, trying direct scrape:', proxyError);
    const rows = await fetchViaDirectScrape();
    return { rows, fetchedAt: new Date().toISOString(), source: 'direct' };
  }
}
