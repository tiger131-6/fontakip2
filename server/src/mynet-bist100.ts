/**
 * Mynet Canlı Borsa — BIST 100 stock list scraper.
 *
 * Primary: smart HTML table parser (skips empty/icon-only cells that misalign columns).
 * Fallback: Handlebars `#stocksData` pipe-delimited blob (no rendered table in raw HTML).
 */

import * as cheerio from 'cheerio';

const PAGE_URL = 'https://finans.mynet.com/borsa/canliborsa/';
const PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

const TICKER_RE = /^[A-Z]{4,5}$/;

/** One BIST 100 row — string fields mirror Mynet's Turkish formatting. */
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
  const $ = cheerio.load(html);
  const parsedStocks: Bist100StockRow[] = [];

  $('table tbody tr').each((_, row) => {
    const firstCell = $(row).find('td:first-child');
    const tickerLink = firstCell.find('a').first();
    const ticker = tickerLink.text().trim();

    if (!TICKER_RE.test(ticker)) return;

    const cells = $(row).find('td');
    const cleanCells = cells
      .map((__, cell) => $(cell).text().trim())
      .get()
      .filter((text) => text !== '');

    const parsed = rowFromCleanCells(ticker, cleanCells);
    if (parsed) parsedStocks.push(parsed);
  });

  parsedStocks.sort((a, b) => a.ticker.localeCompare(b.ticker, 'tr'));
  return parsedStocks;
}

/** Pull the raw pipe blob from Mynet's hidden Handlebars template. */
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

/** Fallback: parse embedded `#stocksData` rows; keep only BIST 100 members. */
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

/** Parse BIST 100 from Mynet HTML — table first, then `#stocksData` fallback. */
export function parseBist100FromHtml(html: string): Bist100StockRow[] {
  const fromTable = parseBist100FromTable(html);
  if (fromTable.length >= 50) return fromTable;

  return parseBist100FromStocksData(html);
}

/** Fetch live BIST 100 quotes from Mynet (manual refresh only — no polling). */
export async function fetchMynetBist100(): Promise<Bist100StockRow[]> {
  const fetchUrl = `${PAGE_URL}?_=${Date.now()}#XU100`;
  const response = await fetch(fetchUrl, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      ...PAGE_HEADERS,
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    },
  } as RequestInit);
  if (!response.ok) throw new Error(`Mynet HTTP ${response.status}`);

  const html = await response.text();
  const rows = parseBist100FromHtml(html);
  if (rows.length === 0) {
    throw new Error('Mynet sayfasında BIST 100 verisi bulunamadı.');
  }
  return rows;
}
