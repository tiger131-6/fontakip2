/**
 * TEFAS price client — NEW API (post April-2026 Next.js rewrite).
 *
 * The legacy POST /api/DB/BindHistoryInfo endpoint was permanently removed when
 * TEFAS migrated to a Next.js stack. The site now calls clean JSON endpoints:
 *
 *   POST https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir   (price/info)
 *
 * Request body (application/json), key fields:
 *   { fonTipi: "YAT", fonKodu: "AAK", basTarih: "YYYYMMDD",
 *     bitTarih: "YYYYMMDD", basSira: 1, bitSira: 100000, dil: "TR" }
 *
 * Response: { resultList: [ { fonKodu, fonUnvan, tarih, fiyat, ... } ], errorMessage }
 *
 * Notes:
 *  - TEFAS publishes prices on business days only (often in the evening), so we
 *    request a small look-back window and use the most recent row returned.
 *  - TEFAS applies ~6 requests/minute; on 429 we honour ratelimit-reset.
 *  - We store the price under TEFAS's OWN reported date (respects the DB's
 *    UNIQUE(fund_code, price_date) constraint).
 */

import axios from 'axios';
import { TRADING_LOOKBACK_DAYS, pickLatestPrice } from './trading-lookback';

const TEFAS_INFO_URL = 'https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir';
/** TEFAS "Fon Verileri" table — same source as the website Excel export (~1014 YAT funds). */
const TEFAS_LISTED_URL = 'https://www.tefas.gov.tr/api/funds/fonGetiriBazliBilgiGetir';
/** Most funds in this app are Yatırım Fonları; fall back to the other types. */
const FUND_KINDS = ['YAT', 'BYF', 'EMK'] as const;
/** TEFAS returns at most ~1 month per request; chunk longer ranges. */
const MAX_DAYS_PER_REQUEST = 28;

const HEADERS = {
  Accept: '*/*',
  'Content-Type': 'application/json',
  Origin: 'https://www.tefas.gov.tr',
  Referer: 'https://www.tefas.gov.tr/tr/fon-verileri',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

export interface TefasPrice {
  /** Price date in 'YYYY-MM-DD' (Europe/Istanbul). */
  date: string;
  /** Net asset value per share (TRY). */
  price: number;
  /** Official fund title as reported by TEFAS. */
  name: string;
}

interface TefasInfoRow {
  fonKodu?: string;
  fonUnvan?: string;
  tarih?: number | string;
  fiyat?: number | string;
}

interface TefasResponse {
  resultList?: TefasInfoRow[];
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** YYYYMMDD for the TEFAS body. */
function toYmd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Convert TEFAS 'tarih' to 'YYYY-MM-DD' (Istanbul).
 * The new API returns ISO 'YYYY-MM-DD' strings, but we also tolerate the
 * legacy 'dd.mm.yyyy' string and epoch-ms number forms.
 */
function toIsoDate(value: number | string): string {
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; // already ISO
    if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return t.slice(0, 10); // ISO datetime
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) {
      const [dd, mm, yyyy] = t.split('.');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  const ms = Number(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`TEFAS geçersiz tarih döndürdü: ${value}`);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Global request throttle. TEFAS allows ~6 req/min and will RESET the TCP
 * connection (ECONNRESET) under bursts rather than returning a clean 429.
 * We serialise all TEFAS calls and keep a minimum gap between them so bursts
 * (e.g. a 14-chunk backfill) don't trip the protection.
 */
const MIN_REQUEST_GAP_MS = 2000;
let lastRequestAt = 0;
let throttleChain: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  // Chain so concurrent callers queue instead of bursting in parallel.
  throttleChain = throttleChain.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  return throttleChain;
}

/**
 * One TEFAS info request over a date window.
 *
 * When `fundCode` is a string we ask for that single fund; when it is `null`
 * we OMIT the code so TEFAS returns EVERY fund of `kind` for the window — this
 * is the key to the full-history sync (one request returns ~2000 funds for a
 * month, instead of one request per fund).
 *
 * Resilient to 429s, empty bodies and connection resets (ECONNRESET) via
 * exponential backoff. Throws only if all attempts are exhausted or TEFAS
 * returns a genuine API error.
 */
async function queryKind(
  fundCode: string | null,
  kind: string,
  start: Date,
  end: Date,
  options?: { failFast?: boolean }
): Promise<TefasInfoRow[]> {
  const body = {
    fonTipi: kind,
    fonKodu: fundCode,
    aramaMetni: null,
    fonTurKod: null,
    fonGrubu: null,
    sfonTurKod: null,
    fonTurAciklama: null,
    kurucuKod: null,
    basTarih: toYmd(start),
    bitTarih: toYmd(end),
    basSira: 1,
    bitSira: 100000,
    dil: 'TR',
    sFonTurKod: '',
    fonKod: '',
    fonGrup: '',
    fonUnvanTip: '',
  };

  const failFast = options?.failFast === true;
  const MAX_ATTEMPTS = failFast ? 2 : 6;
  const requestTimeoutMs = failFast ? 12_000 : 25_000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await throttle();
    try {
      const res = await axios.post<TefasResponse>(TEFAS_INFO_URL, body, {
        headers: HEADERS,
        timeout: requestTimeoutMs,
        validateStatus: (s) => s === 200 || s === 429,
      });

      if (res.status === 429) {
        const reset = Number(res.headers['ratelimit-reset']);
        await sleep((Number.isFinite(reset) ? reset : 20) * 1000 + 500);
        continue;
      }

      const data = res.data;
      // TEFAS sometimes returns an empty 200 body when throttling — back off.
      if (!data || (typeof data === 'string' && (data as string).trim() === '')) {
        await sleep(Math.min(4000 * 2 ** attempt, 30000));
        continue;
      }

      const errMsg = data.errorMessage?.toLowerCase() ?? '';
      // "out of bounds" / "veri bulunamadı" just mean "no rows".
      if (errMsg && !errMsg.includes('out of bounds') && !errMsg.includes('veri bulunamad')) {
        throw new Error(`TEFAS API hatası: ${data.errorMessage}`);
      }
      return Array.isArray(data.resultList) ? data.resultList : [];
    } catch (err) {
      // Connection-level failures (ECONNRESET/timeout) have no HTTP response:
      // wait with exponential backoff and retry. Genuine API errors re-throw.
      const isNetwork = axios.isAxiosError(err) && !err.response;
      if (!isNetwork || attempt === MAX_ATTEMPTS - 1) throw err;
      await sleep(failFast ? 2000 : Math.min(4000 * 2 ** attempt, 30_000));
    }
  }
  throw new Error(
    `TEFAS isteği ${MAX_ATTEMPTS} denemede tamamlanamadı (${fundCode ?? '*'}/${kind}).`
  );
}

/**
 * Fetch the latest available daily price for a fund code from TEFAS.
 * Tries YAT, then BYF, then EMK fund types. Throws if no data is found.
 */
export async function fetchLatestPrice(fundCode: string): Promise<TefasPrice> {
  const code = fundCode.trim().toUpperCase();
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - TRADING_LOOKBACK_DAYS);

  for (const kind of FUND_KINDS) {
    const rows = await queryKind(code, kind, start, end);
    const latest = pickLatestPrice(
      rows,
      (r) => (r.tarih != null ? toIsoDate(r.tarih) : ''),
      (r) => (r.fiyat != null ? Number(r.fiyat) : null)
    );
    if (latest) {
      const nameRow = rows.find((r) => r.tarih != null && toIsoDate(r.tarih) === latest.date);
      return { date: latest.date, price: latest.price, name: nameRow?.fonUnvan ?? '' };
    }
  }

  throw new Error(
    `TEFAS '${code}' için son ${TRADING_LOOKBACK_DAYS} günde fiyat bulunamadı (fon tipi YAT/BYF/EMK denendi).`
  );
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Latest daily % return for a TEFAS-listed fund — derived from the last two
 * published NAV rows (same JSON API as price sync, not legacy FonAnaliz HTML).
 */
export async function fetchTefasFundDailyChangePercent(fundCode: string): Promise<number> {
  const code = fundCode.trim().toUpperCase();
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - TRADING_LOOKBACK_DAYS);

  for (const kind of FUND_KINDS) {
    const rows = await queryKind(code, kind, start, end);
    const points: Array<{ date: string; price: number }> = [];

    for (const row of rows) {
      if (row.tarih == null || row.fiyat == null) continue;
      const date = toIsoDate(row.tarih);
      const price = Number(row.fiyat);
      if (!Number.isFinite(price) || price <= 0) continue;
      points.push({ date, price });
    }

    if (points.length < 2) continue;

    points.sort((a, b) => a.date.localeCompare(b.date));
    const latest = points[points.length - 1];
    const prev = points[points.length - 2];

    if (prev.price === latest.price) {
      throw new Error('TEFAS düz fiyat (stale)');
    }

    return roundTo2(((latest.price - prev.price) / prev.price) * 100);
  }

  throw new Error(`TEFAS '${code}' için günlük getiri hesaplanamadı`);
}

const VALID_HISTORY_RANGES = new Set(['5d', '1mo', '3mo', '6mo', '1y']);

/** Map Yahoo-style range keys to calendar lookback for TEFAS NAV series. */
function historyRangeToDays(range: string): number {
  switch (range) {
    case '5d':
      return 7;
    case '1mo':
      return 31;
    case '3mo':
      return 93;
    case '6mo':
      return 186;
    case '1y':
      return 365;
    default:
      return 31;
  }
}

/**
 * Cumulative % return for a TEFAS fund over a period — first vs latest NAV
 * in the requested window.
 */
export async function fetchTefasFundHistoricalChangePercent(
  fundCode: string,
  range: string
): Promise<number> {
  if (!VALID_HISTORY_RANGES.has(range)) {
    throw new Error(`Geçersiz dönem: ${range}`);
  }

  const code = fundCode.trim().toUpperCase();
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - historyRangeToDays(range));

  for (const kind of FUND_KINDS) {
    const rows = await queryKind(code, kind, start, end);
    const points: Array<{ date: string; price: number }> = [];

    for (const row of rows) {
      if (row.tarih == null || row.fiyat == null) continue;
      const date = toIsoDate(row.tarih);
      const price = Number(row.fiyat);
      if (!Number.isFinite(price) || price <= 0) continue;
      points.push({ date, price });
    }

    if (points.length < 2) continue;

    points.sort((a, b) => a.date.localeCompare(b.date));
    const earliest = points[0];
    const latest = points[points.length - 1];

    if (earliest.price === 0) continue;
    return roundTo2(((latest.price - earliest.price) / earliest.price) * 100);
  }

  throw new Error(`TEFAS '${code}' için dönemsel getiri hesaplanamadı`);
}

/** Split [start, end] into <= maxDays inclusive chunks. */
export function splitRange(start: Date, end: Date, maxDays: number): Array<[Date, Date]> {
  const chunks: Array<[Date, Date]> = [];
  const cur = new Date(start);
  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(cur.getDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push([new Date(cur), new Date(chunkEnd)]);
    cur.setTime(chunkEnd.getTime());
    cur.setDate(cur.getDate() + 1);
  }
  return chunks;
}

/** One normalised price row for an arbitrary fund within a window. */
export interface TefasWindowRow {
  code: string;
  date: string;
  price: number;
}

/** Max days TEFAS accepts in one request ("Tarih aralığı 1 ayı aşamaz"). */
export const TEFAS_MAX_WINDOW_DAYS = MAX_DAYS_PER_REQUEST;

/**
 * Fetch EVERY fund of `kind` for a single window (<=28 days), normalised to
 * {code, date, price}. Used by the full-history sync: one call returns the
 * whole market for the window, so we never loop per-fund. Rows without a usable
 * price are dropped. A single request (the throttle enforces the 2s gap).
 */
export async function fetchWindowAllFunds(
  kind: string,
  start: Date,
  end: Date,
  options?: { failFast?: boolean }
): Promise<TefasWindowRow[]> {
  const rows = await queryKind(null, kind, start, end, options);
  const out: TefasWindowRow[] = [];
  for (const r of rows) {
    if (!r.fonKodu || r.tarih == null || r.fiyat == null) continue;
    const price = Number(r.fiyat);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({ code: String(r.fonKodu).trim().toUpperCase(), date: toIsoDate(r.tarih), price });
  }
  return out;
}

/** Fund identity (code + official TEFAS title) for list reconciliation. */
export interface TefasFundMeta {
  code: string;
  name: string;
}

interface TefasListedRow {
  fonKodu?: string;
  fonUnvan?: string;
  tefasDurum?: boolean;
}

/**
 * Fetch the official TEFAS "Menkul Kıymet Yatırım Fonları" listing — the same
 * ~1014-fund table shown on tefas.gov.tr/tr/fon-verileri and its Excel export.
 *
 * IMPORTANT: Do NOT use fonGnlBlgSiraliGetir (price history) for this. That
 * endpoint returns ~2000+ YAT funds including özel/serbest funds that publish
 * daily NAV but are NOT on the public TEFAS trading list.
 */
interface TefasListedRowFull extends TefasListedRow {
  fonTurAciklama?: string;
  getiri1a?: number | null;
  getiri3a?: number | null;
  getiri6a?: number | null;
  getiri1y?: number | null;
  getiriyb?: number | null;
  getiri3y?: number | null;
  getiri5y?: number | null;
}

function listedFundsRequestBody(kind: string) {
  return {
    dil: 'TR',
    fonTipi: kind,
    kurucuKodu: null,
    sfonTurKod: null,
    fonTurAciklama: null,
    islem: 1,
    fonTurKod: null,
    fonGrubu: null,
    donemGetiri1a: '1',
    donemGetiri3a: '1',
    donemGetiri6a: '1',
    donemGetiri1y: '1',
    donemGetiriyb: '1',
    donemGetiri3y: '1',
    donemGetiri5y: '1',
    basTarih: null,
    bitTarih: null,
    calismaTipi: 2,
    getiriOrani: '1',
  };
}

function parseListedReturn(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface TefasOverviewEntry {
  code: string;
  name: string;
  umbrellaType: string;
  returns: {
    m1: number | null;
    m3: number | null;
    m6: number | null;
    ytd: number | null;
    y1: number | null;
    y3: number | null;
    y5: number | null;
  };
}

/**
 * Official TEFAS "Fon Verileri" table (~1014 YAT funds) with period returns
 * and şemsiye fon type — same source as tefas.gov.tr/tr/fon-verileri.
 */
export async function fetchTefasFundOverview(
  kinds: readonly string[] = ['YAT'],
  options?: { timeoutMs?: number }
): Promise<TefasOverviewEntry[]> {
  const kind = kinds[0] ?? 'YAT';
  const timeoutMs = options?.timeoutMs ?? 25_000;
  await throttle();

  const res = await axios.post<{ resultList?: TefasListedRowFull[] }>(
    TEFAS_LISTED_URL,
    listedFundsRequestBody(kind),
    { headers: HEADERS, timeout: timeoutMs }
  );

  const rows = Array.isArray(res.data?.resultList) ? res.data.resultList : [];
  const out: TefasOverviewEntry[] = [];

  for (const r of rows) {
    if (!r.fonKodu || r.tefasDurum === false) continue;
    out.push({
      code: String(r.fonKodu).trim().toUpperCase(),
      name: (r.fonUnvan ?? '').trim(),
      umbrellaType: (r.fonTurAciklama ?? '').trim() || '—',
      returns: {
        m1: parseListedReturn(r.getiri1a),
        m3: parseListedReturn(r.getiri3a),
        m6: parseListedReturn(r.getiri6a),
        ytd: parseListedReturn(r.getiriyb),
        y1: parseListedReturn(r.getiri1y),
        y3: parseListedReturn(r.getiri3y),
        y5: parseListedReturn(r.getiri5y),
      },
    });
  }

  return out;
}

export async function fetchCurrentFundList(
  kinds: readonly string[] = ['YAT']
): Promise<TefasFundMeta[]> {
  const overview = await fetchTefasFundOverview(kinds);
  return overview.map((r) => ({ code: r.code, name: r.name }));
}

export interface TefasHistory {
  name: string;
  points: TefasPrice[];
}

/**
 * Fetch the full daily price history for a fund over the last `days` days.
 * Splits the range into <=28-day chunks (TEFAS' per-request limit), detects the
 * fund type once, dedupes by date, and returns points sorted oldest-first.
 */
export async function fetchPriceHistory(fundCode: string, days = 365): Promise<TefasHistory> {
  const code = fundCode.trim().toUpperCase();
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const chunks = splitRange(start, end, MAX_DAYS_PER_REQUEST);
  const byDate = new Map<string, number>();
  let kind: string | null = null;
  let name = '';

  let failedChunks = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const [cs, ce] = chunks[i];
    // Once the fund type is known, only query that type for later chunks.
    const kindsToTry: string[] = kind ? [kind] : [...FUND_KINDS];

    try {
      for (const k of kindsToTry) {
        const rows = await queryKind(code, k, cs, ce);
        if (rows.length === 0) continue;
        kind = k;
        for (const r of rows) {
          if (r.tarih == null || r.fiyat == null) continue;
          const price = Number(r.fiyat);
          if (!Number.isFinite(price) || price <= 0) continue;
          byDate.set(toIsoDate(r.tarih), price);
          if (!name && r.fonUnvan) name = r.fonUnvan;
        }
        break; // got this chunk; don't try other kinds
      }
    } catch (err) {
      // Don't abort the whole backfill for one bad chunk — keep partial data.
      failedChunks += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[TEFAS backfill] ${code} chunk ${i + 1}/${chunks.length} atlandı: ${msg}`);
    }
  }

  if (byDate.size === 0 && failedChunks > 0) {
    throw new Error(`TEFAS '${code}' geçmişi alınamadı (tüm parçalar başarısız oldu).`);
  }

  const points: TefasPrice[] = [...byDate.entries()]
    .map(([date, price]) => ({ date, price, name }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { name, points };
}
