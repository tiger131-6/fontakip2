import axios from 'axios';
import * as cheerio from 'cheerio';
import db from './db';

export const GOLD_FUND_CODE = 'ALTIN';

const YAPI_KREDI_LIVE_URL =
  'https://www.yapikredi.com.tr/yatirimci-kosesi/doviz-bilgileri/default.aspx/LoadInternetCurrencies';

const YAPI_KREDI_PAGE_URL = 'https://www.yapikredi.com.tr/yatirimci-kosesi/doviz-bilgileri';

/** Fresh TTL — bank rates; avoid hammering Yapı Kredi on every portfolio view. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Serve recently expired cache while a background refresh runs (stale-while-revalidate). */
const STALE_SERVE_MS = 30 * 60 * 1000;

/** On network/scrape failure, return last good quote if not older than this. */
const STALE_FALLBACK_MS = 24 * 60 * 60 * 1000;

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

export interface GoldPriceQuote {
  /** Bank Alış — portfolio valuation (price if you sell gold to the bank). */
  buyPrice: number;
  /** Bank Satış — reference when buying new gold from the bank. */
  sellPrice: number;
  /** @deprecated Use buyPrice for holdings; kept for compatibility. */
  price: number;
  currency: 'TRY';
  unit: 'gram';
  source: 'yapikredi';
  label: string;
  fetchedAt: string;
  cached: boolean;
}

interface ParsedGoldPrices {
  buyPrice: number;
  sellPrice: number;
}

interface CacheEntry {
  quote: GoldPriceQuote;
  expiresAt: number;
}

interface YkbLiveResponse {
  d?: {
    StatusCode?: number;
    Message?: string | null;
    Data?: string;
  };
}

let cache: CacheEntry | null = null;
let inflight: Promise<GoldPriceQuote> | null = null;
let backgroundRefresh = false;

const stmtUpsertGoldDaily = db.prepare(`
  INSERT INTO price_history (fund_code, price_date, price)
  VALUES (?, ?, ?)
  ON CONFLICT(fund_code, price_date) DO UPDATE SET price = excluded.price
`);

const stmtPreviousGoldDaily = db.prepare(`
  SELECT price FROM price_history
  WHERE fund_code = ? AND price_date < ?
  ORDER BY price_date DESC
  LIMIT 1
`);

/** Persist Yapı Kredi gram altın alış fiyatı — enables günlük getiri for ALTIN holdings. */
export function persistGoldDailyPrice(buyPrice: number, dateIso: string): void {
  const day = dateIso.slice(0, 10);
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) return;
  stmtUpsertGoldDaily.run(GOLD_FUND_CODE, day, buyPrice);
}

/** Previous trading day's stored gold buy price (strictly before `beforeDateIso`). */
export function getPreviousGoldBuyPrice(beforeDateIso: string): number | null {
  const day = beforeDateIso.slice(0, 10);
  const row = stmtPreviousGoldDaily.get(GOLD_FUND_CODE, day) as { price: number } | undefined;
  return row?.price != null && Number.isFinite(row.price) && row.price > 0 ? row.price : null;
}

function snapshotGoldQuote(quote: GoldPriceQuote): void {
  const today = quote.fetchedAt.slice(0, 10);
  if (cache) {
    const priorDay = cache.quote.fetchedAt.slice(0, 10);
    if (priorDay < today) {
      persistGoldDailyPrice(cache.quote.buyPrice, priorDay);
    }
  }
  persistGoldDailyPrice(quote.buyPrice, today);
}

/** Turkish bank format: "6.281,22" → 6281.22 */
export function parseTurkishNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isGramGoldRow(code: string, description: string): boolean {
  const c = code.trim().toUpperCase();
  const d = description.trim().toLowerCase();
  if (c === 'XAU') return true;
  if (d.includes('gram') && (d.includes('altın') || d.includes('altin'))) return true;
  return false;
}

function extractFromTables(html: string): ParsedGoldPrices | null {
  const $ = cheerio.load(html);

  let found: ParsedGoldPrices | null = null;

  $('table tr').each((_, row) => {
    if (found != null) return;
    const cells = $(row)
      .find('td')
      .map((__, td) => $(td).text().replace(/\s+/g, ' ').trim())
      .get();
    if (cells.length < 4) return;

    const [code, description, buyRaw, sellRaw] = cells;
    if (!isGramGoldRow(code, description)) return;

    const buyPrice = parseTurkishNumber(buyRaw);
    const sellPrice = parseTurkishNumber(sellRaw);
    if (buyPrice != null && sellPrice != null) {
      found = { buyPrice, sellPrice };
    }
  });

  return found;
}

function extractFromRegex(html: string): ParsedGoldPrices | null {
  const patterns = [
    /XAU[\s\S]{0,120}?(\d{1,3}(?:\.\d{3})*,\d{2})[\s\S]{0,80}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /Alt[ıi]n\s*\(gram\)[\s\S]{0,120}?(\d{1,3}(?:\.\d{3})*,\d{2})[\s\S]{0,80}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const buyPrice = parseTurkishNumber(match[1]);
    const sellPrice = parseTurkishNumber(match[2]);
    if (buyPrice != null && sellPrice != null) {
      return { buyPrice, sellPrice };
    }
  }

  return null;
}

function scrapeGoldPrices(html: string): ParsedGoldPrices {
  const fromTable = extractFromTables(html);
  if (fromTable != null) return fromTable;

  const fromRegex = extractFromRegex(html);
  if (fromRegex != null) return fromRegex;

  throw new Error('Yapı Kredi yanıtında Gram Altın fiyatları bulunamadı.');
}

/** Same JSON endpoint the public döviz page uses in the browser (LoadInternetCurrencies). */
async function fetchLiveCurrencyTable(): Promise<string> {
  const { data } = await axios.post<YkbLiveResponse>(
    YAPI_KREDI_LIVE_URL,
    {},
    {
      headers: {
        ...REQUEST_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: YAPI_KREDI_PAGE_URL,
      },
      timeout: 15_000,
      validateStatus: (s) => s >= 200 && s < 400,
    }
  );

  const fragment = data?.d?.Data;
  if (data?.d?.StatusCode === 200 && typeof fragment === 'string' && fragment.length > 100) {
    return fragment;
  }

  throw new Error('Yapı Kredi canlı kur servisi beklenmeyen yanıt döndürdü.');
}

async function fetchPageHtml(): Promise<string> {
  const { data } = await axios.get<string>(YAPI_KREDI_PAGE_URL, {
    headers: REQUEST_HEADERS,
    timeout: 15_000,
    responseType: 'text',
    validateStatus: (s) => s >= 200 && s < 400,
  });
  if (typeof data === 'string' && data.length > 500) return data;
  throw new Error('Yapı Kredi sayfası alınamadı.');
}

async function fetchGoldPricesFromYapiKredi(): Promise<ParsedGoldPrices> {
  try {
    const liveTable = await fetchLiveCurrencyTable();
    return scrapeGoldPrices(liveTable);
  } catch (liveErr) {
    try {
      const html = await fetchPageHtml();
      return scrapeGoldPrices(html);
    } catch (pageErr) {
      const liveMsg = liveErr instanceof Error ? liveErr.message : 'canlı servis hatası';
      const pageMsg = pageErr instanceof Error ? pageErr.message : 'sayfa hatası';
      throw new Error(`Yapı Kredi gram altın fiyatı alınamadı (${liveMsg}; ${pageMsg})`);
    }
  }
}

function toQuote(prices: ParsedGoldPrices, fetchedAt: string, cached: boolean): GoldPriceQuote {
  return {
    buyPrice: prices.buyPrice,
    sellPrice: prices.sellPrice,
    price: prices.buyPrice,
    currency: 'TRY',
    unit: 'gram',
    source: 'yapikredi',
    label: 'Gram Altın (Yapı Kredi — canlı)',
    fetchedAt,
    cached,
  };
}

function cacheAgeMs(quote: GoldPriceQuote, now = Date.now()): number {
  const fetched = Date.parse(quote.fetchedAt);
  return Number.isFinite(fetched) ? now - fetched : Infinity;
}

async function fetchAndStoreQuote(): Promise<GoldPriceQuote> {
  const prices = await fetchGoldPricesFromYapiKredi();
  const fetchedAt = new Date().toISOString();
  const quote = toQuote(prices, fetchedAt, false);
  snapshotGoldQuote(quote);
  cache = { quote, expiresAt: Date.now() + CACHE_TTL_MS };
  return quote;
}

function scheduleBackgroundRefresh(): void {
  if (inflight || backgroundRefresh) return;
  backgroundRefresh = true;
  void fetchAndStoreQuote()
    .catch(() => {
      /* keep last cache entry on background failure */
    })
    .finally(() => {
      backgroundRefresh = false;
    });
}

export async function fetchGramGoldPrice(options?: {
  forceRefresh?: boolean;
}): Promise<GoldPriceQuote> {
  const forceRefresh = options?.forceRefresh === true;
  const now = Date.now();

  if (!forceRefresh && cache && cache.expiresAt > now) {
    snapshotGoldQuote(cache.quote);
    return { ...cache.quote, cached: true };
  }

  if (!forceRefresh && inflight) {
    return inflight;
  }

  // Expired but recent: return immediately, refresh in background.
  if (!forceRefresh && cache && cacheAgeMs(cache.quote, now) < STALE_SERVE_MS) {
    scheduleBackgroundRefresh();
    snapshotGoldQuote(cache.quote);
    return { ...cache.quote, cached: true };
  }

  const task = (async (): Promise<GoldPriceQuote> => {
    try {
      return await fetchAndStoreQuote();
    } catch (err) {
      if (cache && cacheAgeMs(cache.quote) < STALE_FALLBACK_MS) {
        console.warn('Güncel veri alınamadı, son bilinen fiyatlar gösteriliyor.');
        snapshotGoldQuote(cache.quote);
        return { ...cache.quote, cached: true };
      }
      throw err;
    }
  })();

  if (!forceRefresh) inflight = task;

  try {
    return await task;
  } finally {
    if (!forceRefresh) inflight = null;
  }
}

/** Returns cached quote without network I/O (for diagnostics). */
export function getCachedGramGoldPrice(): GoldPriceQuote | null {
  if (!cache || cache.expiresAt <= Date.now()) return null;
  return { ...cache.quote, cached: true };
}

/** Last good quote within STALE_FALLBACK_MS — used when live fetch fails. */
export function getLastKnownGramGoldPrice(): GoldPriceQuote | null {
  if (!cache) return null;
  if (cacheAgeMs(cache.quote) >= STALE_FALLBACK_MS) return null;
  return { ...cache.quote, cached: true };
}
