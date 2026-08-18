const ISYATIRIM_API =
  'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/HisseTekil';

const LOOKBACK_DAYS = 14;

interface IsYatirimRow {
  degisim?: unknown;
  DEGISIM?: unknown;
  yuzdedegisim?: unknown;
  YUZDEDEGISIM?: unknown;
  son?: unknown;
  SON?: unknown;
  HGDG_KAPANIS?: unknown;
  HG_KAPANIS?: unknown;
  HGDG_TARIH?: unknown;
}

interface IsYatirimResponse {
  ok?: boolean;
  errorDescription?: string;
  value?: IsYatirimRow[];
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatTrDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw).trim().replace(/%/g, '').replace(/,/g, '.');
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function rowDateMs(row: IsYatirimRow): number {
  const raw = row.HGDG_TARIH;
  if (typeof raw !== 'string') return 0;
  const [dd, mm, yyyy] = raw.split('-').map(Number);
  if (!dd || !mm || !yyyy) return 0;
  return new Date(yyyy, mm - 1, dd).getTime();
}

function sortRowsByDate(rows: IsYatirimRow[]): IsYatirimRow[] {
  return [...rows].sort((a, b) => rowDateMs(a) - rowDateMs(b));
}

/**
 * Derive daily % from the latest HisseTekil row.
 * `degisim` is absolute TRY change — NOT percent. Prefer `yuzdedegisim`, else
 * `(degisim / (son - degisim)) * 100` using last close and TL change.
 */
function percentFromLatestRow(row: IsYatirimRow): number | null {
  for (const field of [row.yuzdedegisim, row.YUZDEDEGISIM]) {
    const parsed = parseNumber(field);
    if (parsed != null) return roundTo2(parsed);
  }

  const tlDegisim = parseNumber(row.degisim ?? row.DEGISIM);
  const sonFiyat = parseNumber(row.son ?? row.SON ?? row.HGDG_KAPANIS ?? row.HG_KAPANIS);

  if (tlDegisim != null && sonFiyat != null) {
    const oncekiKapanis = sonFiyat - tlDegisim;
    if (oncekiKapanis !== 0) {
      return roundTo2((tlDegisim / oncekiKapanis) * 100);
    }
  }

  return null;
}

/** Fetch latest daily % change for a BIST ticker via İş Yatırım HisseTekil JSON. */
export async function fetchBistDailyChangePercent(ticker: string): Promise<number> {
  const code = ticker.trim().toUpperCase();
  if (!code) throw new Error('Geçerli bir hisse kodu girin.');

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - LOOKBACK_DAYS);

  const url =
    `${ISYATIRIM_API}?hisse=${encodeURIComponent(code)}` +
    `&startdate=${formatTrDate(start)}&enddate=${formatTrDate(end)}` +
    `&_=${Date.now()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) throw new Error(`İş Yatırım HTTP ${response.status}`);

  const data = (await response.json()) as IsYatirimResponse;
  if (data.ok === false) {
    throw new Error(data.errorDescription ?? 'İş Yatırım API hatası');
  }

  const rows = data.value;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('İş Yatırım JSON yanıtında veri bulunamadı');
  }

  const sorted = sortRowsByDate(rows);
  const latest = sorted[sorted.length - 1];

  const fromLatest = percentFromLatestRow(latest);
  if (fromLatest != null) return fromLatest;

  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const curClose = parseNumber(latest.HGDG_KAPANIS ?? latest.HG_KAPANIS);
    const prevClose = parseNumber(prev.HGDG_KAPANIS ?? prev.HG_KAPANIS);
    if (curClose != null && prevClose != null && prevClose !== 0) {
      // Identical consecutive closes (e.g. ENKAI 91.05 → 91.05) means stale
      // İş Yatırım data — let the client fallback chain try Yahoo/Bigpara.
      if (curClose === prevClose) {
        throw new Error('İş Yatırım düz kapanış (stale)');
      }
      return roundTo2(((curClose - prevClose) / prevClose) * 100);
    }
  }

  throw new Error('Günlük değişim yüzdesi bulunamadı');
}
