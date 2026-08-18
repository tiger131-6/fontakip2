/**
 * FonBul advanced metrics scraper.
 *
 * Fetches each fund's historical price table page, parses rows with cheerio when
 * present, and falls back to FonBul's RaporTabloHesapla API (same source the
 * page uses via tabloHesapla) when the static HTML table is empty.
 */

import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import db from './db';
import type { IncrementalRange } from './seed-history';
import { TRADING_LOOKBACK_DAYS, daysBeforeIso, todayIso } from './trading-lookback';

const FONBUL_PAGE_BASE =
  'https://www.fonbul.com/FonBulPlus/YatirimFonlari/FonProfilleri/FonFiyatTablosu';
const FONBUL_APP_URL = 'https://www.fonbul.com/FonBulPlus/YatirimFonlari';
const FONBUL_SERVIS_URL = 'https://internalapi.finnet.com.tr/FonBulPlusServis/fonbul/tr';
const SCRAPE_START = '2020-01-01';
export const FONBUL_FUND_DELAY_MS = 2000;
/** Parallel workers — each uses its own FonBul session (shared keys reject concurrent use). */
export const FONBUL_PARALLEL_WORKERS = 50;
const SKIP_CODES = new Set(['ALTIN']);

const HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'tr-TR,tr;q=0.9',
};

export interface FonbulPriceRow {
  price_date: string;
  price: number;
  portfolio_value: number | null;
  total_pay_value: number | null;
  total_shares: number | null;
  investor_count: number | null;
  active_value: number | null;
  occupancy_rate: number | null;
}

export interface FonbulScrapeProgress {
  current: number;
  total: number;
  currentFund: string;
  status: 'scraping' | 'warn' | 'done' | 'stopped';
  inserted: number;
  message?: string;
}

export interface FonbulScrapeResult {
  completed: boolean;
  stopped: boolean;
  inserted: number;
  fundsWithData: number;
  total: number;
  current: number;
}

/** Turkish locale number: `13.202.246,00` → 13202246, strips `%`. */
export function parseTurkishNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;
  const cleaned = trimmed.replace(/%/g, '').replace(/\s/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** `DD.MM.YYYY` or ISO `YYYY-MM-DD` → `YYYY-MM-DD`. */
export function formatTurkishDateToIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function normalizeHeader(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function headerKey(text: string): string | null {
  const h = normalizeHeader(text);
  if (h.includes('tarih') && !h.includes('degerleme')) return 'date';
  if (h === 'fiyat') return 'price';
  if (h.includes('portfoy deger')) return 'portfolio_value';
  if (h.includes('toplam pay')) return 'total_pay_value';
  if (h.includes('tedavuldeki pay') || h.includes('tedarikteki pay')) return 'total_shares';
  if (h.includes('aktif deger')) return 'active_value';
  if (h.includes('yatirimci')) return 'investor_count';
  if (h.includes('doluluk')) return 'occupancy_rate';
  return null;
}

/** Parse `#tableContainer` rows from the FonBul HTML page. */
export function parseFonbulHtmlTable(html: string): FonbulPriceRow[] {
  const $ = cheerio.load(html);
  const table = $('#tableContainer');
  if (!table.length) return [];

  const headerCells = table.find('thead th, tr:first-child th');
  const headers: Array<string | null> = [];
  headerCells.each((_, th) => {
    headers.push(headerKey($(th).text()));
  });

  const rows: FonbulPriceRow[] = [];
  const bodyRows = headerCells.length ? table.find('tbody tr') : table.find('tr').slice(1);

  bodyRows.each((_, tr) => {
    const cells = $(tr)
      .find('td')
      .map((__, td) => $(td).text().replace(/\s+/g, ' ').trim())
      .get();
    if (!cells.length) return;

    const mapped: Record<string, string> = {};
    if (headers.length) {
      cells.forEach((cell, i) => {
        const key = headers[i];
        if (key) mapped[key] = cell;
      });
    } else if (cells.length >= 2) {
      mapped.date = cells[0];
      mapped.price = cells[1];
      if (cells[3]) mapped.portfolio_value = cells[3];
      if (cells[4]) mapped.total_pay_value = cells[4];
      if (cells[5]) mapped.total_shares = cells[5];
      if (cells[6]) mapped.investor_count = cells[6];
      if (cells[7]) mapped.active_value = cells[7];
      if (cells[8]) mapped.occupancy_rate = cells[8];
    }

    const price_date = formatTurkishDateToIso(mapped.date);
    const price = parseTurkishNumber(mapped.price);
    if (!price_date || price == null) return;

    rows.push({
      price_date,
      price,
      portfolio_value: parseTurkishNumber(mapped.portfolio_value),
      total_pay_value: parseTurkishNumber(mapped.total_pay_value),
      total_shares: parseTurkishNumber(mapped.total_shares),
      investor_count: parseTurkishNumber(mapped.investor_count),
      active_value: parseTurkishNumber(mapped.active_value),
      occupancy_rate: parseTurkishNumber(mapped.occupancy_rate),
    });
  });

  return rows;
}

interface JsVeriRow {
  o?: {
    Tarih?: string;
    Fiyat?: number;
    Portfoy?: number;
    ToplamPay?: number;
    TedariktekiPay?: number;
    YatirimciAdet?: number;
    FonAktif?: number;
    DolulukOran?: number;
  };
}

function parseApiTableRows(data: unknown): FonbulPriceRow[] {
  const root = data as { TabloListesi?: Array<{ JSVeriler?: JsVeriRow[] }> };
  const jsRows = root?.TabloListesi?.[0]?.JSVeriler ?? [];
  const rows: FonbulPriceRow[] = [];

  for (const row of jsRows) {
    const o = row.o;
    if (!o?.Tarih || o.Fiyat == null) continue;
    const price_date = formatTurkishDateToIso(o.Tarih);
    if (!price_date) continue;
    rows.push({
      price_date,
      price: o.Fiyat,
      portfolio_value: o.Portfoy ?? null,
      total_pay_value: o.ToplamPay ?? null,
      total_shares: o.TedariktekiPay ?? null,
      investor_count: o.YatirimciAdet != null ? Math.round(o.YatirimciAdet) : null,
      active_value: o.FonAktif ?? null,
      occupancy_rate: o.DolulukOran ?? null,
    });
  }

  return rows;
}

async function createFonbulClient(): Promise<AxiosInstance> {
  return axios.create({
    headers: HTTP_HEADERS,
    timeout: 45000,
    validateStatus: (s) => s >= 200 && s < 500,
  });
}

async function fetchServisKey(
  client: AxiosInstance,
  pageHtml: string,
  cookies: string
): Promise<string> {
  const $ = cheerio.load(pageHtml);
  const token = $('input[name="__RequestVerificationToken"]').val();
  const embedded = pageHtml.match(/var sessionKey = '([^']+)'/);
  if (embedded?.[1]) return embedded[1];

  const keyRes = await client.post(`${FONBUL_APP_URL}/Uye/GetServisKey`, null, {
    headers: {
      Cookie: cookies,
      ...(typeof token === 'string' && token ? { 'X-CSRF-Token': token } : {}),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  if (typeof keyRes.data === 'string' && keyRes.data) return keyRes.data;
  throw new Error('FonBul servis anahtarı alınamadı.');
}

export interface FonbulSession {
  client: AxiosInstance;
  cookies: string;
  servisKey: string;
}

export async function createFonbulSession(seedCode = 'AAV'): Promise<FonbulSession> {
  const client = await createFonbulClient();
  const pageRes = await client.get(`${FONBUL_PAGE_BASE}/${encodeURIComponent(seedCode)}`);
  if (pageRes.status >= 400) {
    throw new Error(`FonBul oturumu açılamadı (HTTP ${pageRes.status})`);
  }
  const cookies =
    pageRes.headers['set-cookie']?.map((c: string) => c.split(';')[0]).join('; ') ?? '';
  const servisKey = await fetchServisKey(client, String(pageRes.data), cookies);
  return { client, cookies, servisKey };
}

async function fetchApiRows(
  session: FonbulSession,
  code: string,
  startDate: string,
  endDate: string
): Promise<FonbulPriceRow[]> {
  const param = {
    Url: 'fonbul-profil-fiyat-grafik',
    RaporParametreleri: [
      { key: 'Kod', value: code },
      { key: 'KaydirilmisVeri', value: '0' },
      { key: 'TarihArtanSira', value: '0' },
      { key: 'IlkTarih', value: startDate },
      { key: 'SonTarih', value: endDate },
    ],
    OzelParametreler: [
      {
        key: 'VeriAlanlar',
        value:
          'Tarih,Portfoy,FonAktif,Fiyat,ToplamPay,TedariktekiPay,DolulukOran,YatirimciAdet',
      },
    ],
    RaporKriter: { VeriGrup: 'FonKriter' },
  };

  const apiRes = await session.client.post(
    `${FONBUL_SERVIS_URL}/RaporTabloHesapla`,
    { RaporParams: param },
    {
      headers: {
        Cookie: session.cookies,
        'authorization-serviskey': session.servisKey,
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  );

  if (apiRes.status >= 400) {
    throw new Error(`FonBul API HTTP ${apiRes.status}`);
  }

  return parseApiTableRows(apiRes.data);
}

/** Scrape one fund: page fetch (cheerio) + API fallback. */
export async function scrapeFonbulFund(code: string): Promise<FonbulPriceRow[]> {
  const client = await createFonbulClient();
  const pageUrl = `${FONBUL_PAGE_BASE}/${encodeURIComponent(code)}`;
  const pageRes = await client.get(pageUrl);
  if (pageRes.status >= 400) {
    throw new Error(`FonBul sayfası HTTP ${pageRes.status}`);
  }

  const cookies =
    pageRes.headers['set-cookie']?.map((c: string) => c.split(';')[0]).join('; ') ?? '';
  const html = String(pageRes.data);

  const htmlRows = parseFonbulHtmlTable(html);
  if (htmlRows.length > 0) return htmlRows;

  const endDate = new Date().toISOString().slice(0, 10);
  const servisKey = await fetchServisKey(client, html, cookies);
  return fetchApiRows({ client, cookies, servisKey }, code, SCRAPE_START, endDate);
}

/** Fetch FonBul metrics for a date window (API only — used by incremental sync). */
export async function fetchFonbulFundRange(
  session: FonbulSession,
  code: string,
  startDate: string,
  endDate: string
): Promise<FonbulPriceRow[]> {
  return fetchApiRows(session, code, startDate, endDate);
}

/** One fund, one session — safe for parallel calls (Finnet keys are not concurrent-shareable). */
export async function fetchFonbulFundRangeStandalone(
  code: string,
  startDate: string,
  endDate: string
): Promise<FonbulPriceRow[]> {
  const session = await createFonbulSession(code);
  return fetchFonbulFundRange(session, code, startDate, endDate);
}

/**
 * Günlük sync: include funds whose latest FonBul metric lags behind latest price
 * (or is older than yesterday). Having any row in the 7-day window is not enough.
 */
export function listFonbulCodesNeedingUpdate(
  endDate: string,
  range: IncrementalRange = 'daily'
): string[] {
  const all = listFonbulFundCodes();

  if (range === 'daily') {
    const minFreshDate = daysBeforeIso(endDate, 1);
    const stmt = db.prepare(
      `SELECT
         MAX(CASE WHEN portfolio_value IS NOT NULL THEN price_date END) AS metricMax,
         MAX(price_date) AS priceMax
       FROM price_history
       WHERE fund_code = ?`
    );

    return all.filter((code) => {
      const row = stmt.get(code) as { metricMax: string | null; priceMax: string | null };
      if (!row.metricMax) return true;
      if (row.priceMax && row.metricMax < row.priceMax) return true;
      if (row.metricMax < minFreshDate) return true;
      return false;
    });
  }

  const lookbackDays = TRADING_LOOKBACK_DAYS;
  const startDate = daysBeforeIso(endDate, lookbackDays);
  const fresh = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT fund_code FROM price_history
           WHERE portfolio_value IS NOT NULL
             AND price_date >= ?
             AND price_date <= ?`
        )
        .all(startDate, endDate) as Array<{ fund_code: string }>
    ).map((r) => r.fund_code)
  );
  return all.filter((code) => !fresh.has(code));
}

async function runFonbulParallelPool(options: {
  codes: string[];
  startDate: string;
  endDate: string;
  onProgress: (p: FonbulScrapeProgress) => void;
  shouldStop: () => boolean;
}): Promise<{
  inserted: number;
  fundsWithData: number;
  completed: boolean;
  stopped: boolean;
  total: number;
  current: number;
}> {
  const { codes, startDate, endDate } = options;
  const total = codes.length;
  let inserted = 0;
  let current = 0;
  let stopped = false;
  const fundsWithData = new Set<string>();
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      if (options.shouldStop()) {
        stopped = true;
        return;
      }
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;

      const fundCode = codes[index];
      try {
        const rows = await fetchFonbulFundRangeStandalone(fundCode, startDate, endDate);
        if (rows.length > 0) {
          inserted += upsertRows(fundCode, rows);
          fundsWithData.add(fundCode);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
        options.onProgress({
          current,
          total,
          currentFund: fundCode,
          status: 'warn',
          inserted,
          message: `${fundCode}: ${message}`,
        });
      }

      current += 1;
      options.onProgress({
        current,
        total,
        currentFund: fundCode,
        status: 'scraping',
        inserted,
      });
    }
  };

  const workers = Math.min(FONBUL_PARALLEL_WORKERS, Math.max(total, 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  return {
    inserted,
    fundsWithData: fundsWithData.size,
    completed: !stopped,
    stopped,
    total,
    current,
  };
}

const stmtUpsert = db.prepare(`
  INSERT INTO price_history
    (fund_code, price_date, price, portfolio_value, total_pay_value, total_shares, investor_count, active_value, occupancy_rate)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(fund_code, price_date) DO UPDATE SET
    price = excluded.price,
    portfolio_value = excluded.portfolio_value,
    total_pay_value = excluded.total_pay_value,
    total_shares = excluded.total_shares,
    investor_count = excluded.investor_count,
    active_value = excluded.active_value,
    occupancy_rate = excluded.occupancy_rate
`);

function upsertRows(fundCode: string, rows: FonbulPriceRow[]): number {
  const tx = db.transaction((items: FonbulPriceRow[]) => {
    let count = 0;
    for (const row of items) {
      stmtUpsert.run(
        fundCode,
        row.price_date,
        row.price,
        row.portfolio_value,
        row.total_pay_value,
        row.total_shares,
        row.investor_count,
        row.active_value,
        row.occupancy_rate
      );
      count += 1;
    }
    return count;
  });
  return tx(rows);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FonbulStats {
  totalRows: number;
  rowsWithMetrics: number;
  fundCount: number;
  minDate: string | null;
  maxDate: string | null;
}

export interface FonbulMetricRow {
  id: number;
  fund_code: string;
  price_date: string;
  price: number;
  portfolio_value: number | null;
  total_pay_value: number | null;
  total_shares: number | null;
  investor_count: number | null;
  active_value: number | null;
  occupancy_rate: number | null;
}

export function getFonbulStats(): FonbulStats {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS totalRows,
         SUM(CASE WHEN portfolio_value IS NOT NULL THEN 1 ELSE 0 END) AS rowsWithMetrics,
         COUNT(DISTINCT CASE WHEN portfolio_value IS NOT NULL THEN fund_code END) AS fundCount,
         MIN(CASE WHEN portfolio_value IS NOT NULL THEN price_date END) AS minDate,
         MAX(CASE WHEN portfolio_value IS NOT NULL THEN price_date END) AS maxDate
       FROM price_history`
    )
    .get() as {
    totalRows: number;
    rowsWithMetrics: number;
    fundCount: number;
    minDate: string | null;
    maxDate: string | null;
  };

  return {
    totalRows: row.totalRows,
    rowsWithMetrics: row.rowsWithMetrics ?? 0,
    fundCount: row.fundCount ?? 0,
    minDate: row.minDate,
    maxDate: row.maxDate,
  };
}

export interface FonbulMetricsPage {
  rows: FonbulMetricRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  fundMinDate: string | null;
  fundMaxDate: string | null;
  filterStart: string | null;
  filterEnd: string | null;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseMonthParam(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return MONTH_RE.test(trimmed) ? trimmed : null;
}

function monthToStartDate(month: string): string {
  return `${month}-01`;
}

function monthToEndDate(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

function parseIsoDateParam(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return null;
  const maxDay = new Date(y, m, 0).getDate();
  if (d > maxDay) return null;
  return trimmed;
}

export function getFonbulMetrics(
  fundCode: string,
  page = 1,
  pageSize = 25,
  options: {
    start?: string | null;
    end?: string | null;
    startMonth?: string | null;
    endMonth?: string | null;
  } = {}
): FonbulMetricsPage {
  const code = fundCode.trim().toUpperCase();
  const size = Math.min(Math.max(pageSize, 1), 100);
  const pageNum = Math.max(page, 1);
  const offset = (pageNum - 1) * size;

  const startDate = parseIsoDateParam(options.start ?? null);
  const endDate = parseIsoDateParam(options.end ?? null);
  const startMonth = parseMonthParam(options.startMonth ?? null);
  const endMonth = parseMonthParam(options.endMonth ?? null);

  let dateFrom = startDate;
  let dateTo = endDate;
  if (!dateFrom && startMonth) dateFrom = monthToStartDate(startMonth);
  if (!dateTo && endMonth) dateTo = monthToEndDate(endMonth);

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
  }

  const bounds = db
    .prepare(
      `SELECT MIN(price_date) AS minDate, MAX(price_date) AS maxDate
       FROM price_history
       WHERE fund_code = ? AND portfolio_value IS NOT NULL`
    )
    .get(code) as { minDate: string | null; maxDate: string | null };

  const where = [
    'fund_code = ?',
    'portfolio_value IS NOT NULL',
    ...(dateFrom ? ['price_date >= ?'] : []),
    ...(dateTo ? ['price_date <= ?'] : []),
  ].join(' AND ');

  const filterParams: Array<string> = [];
  if (dateFrom) filterParams.push(dateFrom);
  if (dateTo) filterParams.push(dateTo);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM price_history WHERE ${where}`)
    .get(code, ...filterParams) as { c: number };
  const total = totalRow.c;
  const totalPages = total > 0 ? Math.ceil(total / size) : 0;

  const rows = db
    .prepare(
      `SELECT id, fund_code, price_date, price, portfolio_value, total_pay_value, total_shares,
              investor_count, active_value, occupancy_rate
       FROM price_history
       WHERE ${where}
       ORDER BY price_date DESC
       LIMIT ? OFFSET ?`
    )
    .all(code, ...filterParams, size, offset) as FonbulMetricRow[];

  return {
    rows,
    total,
    page: pageNum,
    pageSize: size,
    totalPages,
    fundMinDate: bounds.minDate,
    fundMaxDate: bounds.maxDate,
    filterStart: dateFrom,
    filterEnd: dateTo,
  };
}

export function listFonbulFundCodes(): string[] {
  return (
    db
      .prepare(`SELECT fund_code FROM funds WHERE fund_code NOT IN ('ALTIN') ORDER BY fund_code`)
      .all() as Array<{ fund_code: string }>
  ).map((r) => r.fund_code);
}

/** Günlük / haftalık / aylık FonBul metrik güncellemesi (parallel API, kısa tarih aralığı). */
export async function runFonbulIncrementalSync(options: {
  startDate: string;
  range?: IncrementalRange;
  onProgress: (p: FonbulScrapeProgress) => void;
  shouldStop: () => boolean;
}): Promise<{
  inserted: number;
  fundsWithData: number;
  completed: boolean;
  stopped: boolean;
  total: number;
  current: number;
}> {
  const endDate = todayIso();
  const isDaily = options.range === 'daily';
  const codes = isDaily
    ? listFonbulCodesNeedingUpdate(endDate, options.range ?? 'daily')
    : listFonbulFundCodes();

  if (codes.length === 0) {
    options.onProgress({
      current: 0,
      total: 0,
      currentFund: '—',
      status: 'done',
      inserted: 0,
      message: isDaily ? 'Tüm fonların FonBul metrikleri güncel.' : undefined,
    });
    return {
      inserted: 0,
      fundsWithData: 0,
      completed: true,
      stopped: false,
      total: 0,
      current: 0,
    };
  }

  return runFonbulParallelPool({
    codes,
    startDate: options.startDate,
    endDate,
    onProgress: options.onProgress,
    shouldStop: options.shouldStop,
  });
}

export async function runFonbulScrapeAll(options: {
  onProgress: (p: FonbulScrapeProgress) => void;
  shouldStop: () => boolean;
}): Promise<FonbulScrapeResult> {
  const endDate = new Date().toISOString().slice(0, 10);
  const result = await runFonbulParallelPool({
    codes: listFonbulFundCodes(),
    startDate: SCRAPE_START,
    endDate,
    onProgress: options.onProgress,
    shouldStop: options.shouldStop,
  });
  return {
    completed: result.completed,
    stopped: result.stopped,
    inserted: result.inserted,
    fundsWithData: result.fundsWithData,
    total: result.total,
    current: result.current,
  };
}
