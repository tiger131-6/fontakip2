import { apiUrl } from '../config/apiBase';

/**
 * TEFAS fund minimum-purchase rules.
 *
 * Primary source: bundled Express proxy (/api/market/tefas-min-purchase/:code),
 * which scrapes the TEFAS fund page server-side with browser headers, retries
 * through TEFAS's burst protection and caches for 24h.
 *
 * Fallback: direct client-side scrape of
 * https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=XXX (Electron CORS bypass —
 * same pattern as the Bigpara scraper). On the new Next.js page every info
 * field is a pair of consecutive <p> elements: <p>label</p><p>value</p>.
 *
 * Two distinct rules exist on TEFAS:
 *  - "Min. Alış İşlem Tutarı"  — fixed fiat entry barrier in TRY
 *    (hedge funds / serbest fonlar, e.g. 5.000.000 TL)
 *  - "Min. Alış İşlem Miktarı" — minimum share count (regular funds, usually 1)
 */

// The new TEFAS site labels these "Alış"; tolerate the legacy "Alım" spelling
// plus wording variations ("Minimum İşlem Tutarı", "Alt Limit", "Asgari ... Tutar").
const MIN_AMOUNT_LABEL =
  /Min(?:\.|imum)?\s*(?:Al(?:ış|ım)\s*)?(?:İşlem\s*)?Tutarı?|Alt\s*Limit|Asgari\s*(?:Al(?:ış|ım)|İşlem)?\s*Tutarı?/i;
const MIN_QUANTITY_LABEL =
  /Min(?:\.|imum)?\s*(?:Al(?:ış|ım)\s*)?(?:İşlem\s*)?Miktarı?/i;
// Never treat sell-side ("Satış") or maximum ("Max") rows as the purchase minimum.
const EXCLUDED_LABEL = /Satış|Ma(?:x|ks)/i;

export interface TefasMinPurchaseInfo {
  /** Fixed TRY entry barrier ("Tutarı"), when TEFAS publishes one. */
  explicitTlAmount: number | null;
  /** Minimum share count ("Miktarı"); defaults to 1 when not published. */
  shareQuantity: number;
}

/** Parse Turkish-formatted numbers: "5.000.000" / "5.000.000,00" / "1". */
function parseTurkishNumber(raw: string | null | undefined): number | null {
  const text = raw?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text || text === '-') return null;
  const cleaned = text.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function findLabeledValue(doc: Document, label: RegExp): number | null {
  for (const el of doc.querySelectorAll('p, td, span, li')) {
    const text = el.textContent ?? '';
    // Skip container nodes that hold the whole section text.
    if (text.length > 60 || !label.test(text) || EXCLUDED_LABEL.test(text)) continue;

    const fromSibling = parseTurkishNumber(el.nextElementSibling?.textContent);
    if (fromSibling != null) return fromSibling;

    // Combined label+value in the same node, e.g. "Min. Alış İşlem Miktarı 10":
    // strip the label text, then parse what remains.
    const fromInline = parseTurkishNumber(text.replace(label, ''));
    if (fromInline != null) return fromInline;
  }
  return null;
}

function parseMinPurchaseInfo(doc: Document): TefasMinPurchaseInfo | null {
  const rawAmount = findLabeledValue(doc, MIN_AMOUNT_LABEL);
  // TEFAS publishes "0" for funds without a fiat barrier — treat as absent.
  const explicitTlAmount = rawAmount != null && rawAmount > 0 ? rawAmount : null;

  const rawQuantity = findLabeledValue(doc, MIN_QUANTITY_LABEL);
  const shareQuantity =
    rawQuantity != null && rawQuantity > 0 ? Math.round(rawQuantity) : 1;

  if (explicitTlAmount == null && rawQuantity == null) return null;
  return { explicitTlAmount, shareQuantity };
}

/** Primary — bundled Express proxy (server-side scrape, retried + cached). */
async function fetchViaProxy(code: string): Promise<TefasMinPurchaseInfo | null> {
  try {
    const response = await fetch(
      apiUrl(`/market/tefas-min-purchase/${encodeURIComponent(code)}`),
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      explicitTlAmount?: unknown;
      shareQuantity?: unknown;
    };
    const amount = Number(data.explicitTlAmount);
    const quantity = Number(data.shareQuantity);
    return {
      explicitTlAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
      shareQuantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1,
    };
  } catch {
    return null;
  }
}

/** Fallback — direct client-side scrape (Electron CORS bypass). */
async function fetchViaDirectScrape(code: string): Promise<TefasMinPurchaseInfo | null> {
  try {
    const response = await fetch(
      `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(code)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'tr-TR,tr;q=0.9',
        },
      }
    );
    if (!response.ok) return null;

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return parseMinPurchaseInfo(doc);
  } catch (error) {
    console.warn(`[TEFAS] Doğrudan FonAnaliz fetch failed for ${code}:`, error);
    return null;
  }
}

/**
 * Returns the fund's minimum purchase rules, or null when TEFAS is
 * unreachable / neither field is published.
 */
export async function fetchTefasMinPurchaseInfo(
  fundCode: string
): Promise<TefasMinPurchaseInfo | null> {
  const code = fundCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(code)) return null;

  const viaProxy = await fetchViaProxy(code);
  if (viaProxy != null) {
    console.log(
      `[TEFAS] ${code} min. alım limiti (proxy): tutar=${viaProxy.explicitTlAmount ?? '-'} miktar=${viaProxy.shareQuantity}`
    );
    return viaProxy;
  }

  const direct = await fetchViaDirectScrape(code);
  if (direct != null) {
    console.log(
      `[TEFAS] ${code} min. alım limiti (direct): tutar=${direct.explicitTlAmount ?? '-'} miktar=${direct.shareQuantity}`
    );
    return direct;
  }

  console.warn(`[TEFAS] Min. alım limiti alınamadı: ${code}`);
  return null;
}
