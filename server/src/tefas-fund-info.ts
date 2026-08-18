/**
 * TEFAS fund minimum-purchase scraper (server-side).
 *
 * Fetches https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=XXX (redirects to the
 * new Next.js page /tr/fon-detayli-analiz/XXX) and extracts the minimum
 * purchase rules. On the new page every info field is a pair of consecutive
 * <p> elements: <p>label</p><p>value</p>.
 *
 * Two distinct rules exist on TEFAS:
 *  - "Min. Alış İşlem Tutarı"  — fixed fiat entry barrier in TRY
 *    (hedge funds / serbest fonlar)
 *  - "Min. Alış İşlem Miktarı" — minimum share count (regular funds)
 *
 * The new site says "Alış"; the legacy page said "Alım" — both are matched.
 * Results are cached for 24h (these rules practically never change intraday),
 * which also keeps us clear of TEFAS's aggressive burst protection.
 */

// NOTE: TEFAS's WAF serves a ~7 KB JS-challenge page (no fund data) to full
// Chrome UA strings, but passes the plain AppleWebKit UA. Verified 2026-07.
const PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

const MIN_AMOUNT_LABEL =
  /Min(?:\.|imum)?\s*(?:Al(?:ış|ım)\s*)?(?:İşlem\s*)?Tutarı?|Alt\s*Limit|Asgari\s*(?:Al(?:ış|ım)|İşlem)?\s*Tutarı?/i;
const MIN_QUANTITY_LABEL = /Min(?:\.|imum)?\s*(?:Al(?:ış|ım)\s*)?(?:İşlem\s*)?Miktarı?/i;
/** Never treat sell-side ("Satış") or maximum ("Max") rows as the purchase minimum. */
const EXCLUDED_LABEL = /Satış|Ma(?:x|ks)/i;

export interface TefasMinPurchaseInfo {
  /** Fixed TRY entry barrier ("Tutarı"), when TEFAS publishes one. */
  explicitTlAmount: number | null;
  /** Minimum share count ("Miktarı"); defaults to 1 when not published. */
  shareQuantity: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; info: TefasMinPurchaseInfo }>();

/** Parse Turkish-formatted numbers: "5.000.000" / "5.000.000,00" / "1". */
function parseTurkishNumber(raw: string | null | undefined): number | null {
  const text = raw?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text || text === '-') return null;
  const cleaned = text.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Extract all <p>label</p><p>value</p> pairs from the rendered page HTML. */
function extractLabelValuePairs(html: string): Array<[string, string]> {
  return [...html.matchAll(/<p[^>]*>([^<]{2,60})<\/p>\s*<p[^>]*>([^<]{1,60})<\/p>/g)].map(
    (m) => [m[1].trim(), m[2].trim()]
  );
}

function findLabeledValue(pairs: Array<[string, string]>, label: RegExp): number | null {
  for (const [rawLabel, rawValue] of pairs) {
    if (!label.test(rawLabel) || EXCLUDED_LABEL.test(rawLabel)) continue;
    const parsed = parseTurkishNumber(rawValue);
    if (parsed != null) return parsed;
  }
  return null;
}

export function parseMinPurchaseInfoFromHtml(html: string): TefasMinPurchaseInfo | null {
  const pairs = extractLabelValuePairs(html);

  const rawAmount = findLabeledValue(pairs, MIN_AMOUNT_LABEL);
  // TEFAS publishes "0" for funds without a fiat barrier — treat as absent.
  const explicitTlAmount = rawAmount != null && rawAmount > 0 ? rawAmount : null;

  const rawQuantity = findLabeledValue(pairs, MIN_QUANTITY_LABEL);
  const shareQuantity = rawQuantity != null && rawQuantity > 0 ? Math.round(rawQuantity) : 1;

  if (explicitTlAmount == null && rawQuantity == null) return null;
  return { explicitTlAmount, shareQuantity };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch and parse a fund's minimum purchase rules.
 * Throws when TEFAS is unreachable or the fields aren't published.
 */
export async function fetchTefasMinPurchaseInfo(fundCode: string): Promise<TefasMinPurchaseInfo> {
  const code = fundCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(code)) {
    throw new Error('Geçerli bir fon kodu girin.');
  }

  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.info;

  // TEFAS resets TCP connections under bursts; retry a couple of times.
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${code}`, {
        method: 'GET',
        headers: PAGE_HEADERS,
      });
      if (!response.ok) throw new Error(`TEFAS HTTP ${response.status}`);

      const html = await response.text();
      const info = parseMinPurchaseInfoFromHtml(html);
      if (info == null) {
        throw new Error(`TEFAS min. alım limiti bulunamadı: ${code}`);
      }

      cache.set(code, { at: Date.now(), info });
      return info;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(2500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('TEFAS fon bilgisi alınamadı.');
}
