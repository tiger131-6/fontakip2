/**
 * Fund-list reconciliation against TEFAS.
 *
 * Compares the live TEFAS fund universe with our local `funds` table to detect:
 *   - ADDED:   funds on TEFAS but not in our DB (new listings)
 *   - MISSING: funds in our DB not seen on TEFAS recently (possibly delisted)
 *
 * `checkFundList` is read-only (reports the diff). `applyFundList` commits it:
 * inserts new funds (tax status derived from the name marker) and flips
 * `is_active` for everyone — it NEVER deletes funds or their price history.
 */

import db from './db';
import { GOLD_FUND_CODE } from './gold-price';
import { fetchCurrentFundList } from './tefas';

/** Local portfolio assets not listed on TEFAS — excluded from list reconciliation. */
const LOCAL_ONLY_FUND_CODES = new Set([GOLD_FUND_CODE]);

/**
 * Menkul Kıymet Yatırım Fonları only (YAT). Uses TEFAS "Fon Verileri" table
 * API (~1014 funds), NOT the price-history bulk API (~2000+ including özel fonlar).
 */
const LIST_KINDS = ['YAT'] as const;

/** Turkish-aware normalisation so the "hisse senedi yoğun fon" marker matches. */
function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFC')
    .replace(/\u0131/g, 'i') // ı
    .replace(/\u0307/g, '') // combining dot above (from İ)
    .replace(/\u011f/g, 'g') // ğ
    .replace(/\u00f6/g, 'o') // ö
    .replace(/\u00fc/g, 'u') // ü
    .replace(/\u015f/g, 's') // ş
    .replace(/\u00e7/g, 'c'); // ç
}

const TAX_FREE_MARKER = normalizeTr('hisse senedi yoğun fon');

/** Tax-free iff the official fund title contains "hisse senedi yoğun fon". */
export function isTaxFreeByName(name: string): boolean {
  return normalizeTr(name).includes(TAX_FREE_MARKER);
}

export interface AddedFund {
  code: string;
  name: string;
  isTaxFree: boolean;
}

export interface MissingFund {
  code: string;
  name: string;
}

export interface FundListDiff {
  added: AddedFund[];
  missing: MissingFund[];
  tefasCount: number;
  dbCount: number;
}

interface DbFundRow {
  fund_code: string;
  fund_name: string;
  is_active: number;
}

/** Read-only: fetch TEFAS list and diff it against the DB. */
export async function checkFundList(): Promise<FundListDiff> {
  const current = await fetchCurrentFundList(LIST_KINDS);
  const currentCodes = new Set(current.map((f) => f.code));

  const dbRows = db
    .prepare('SELECT fund_code, fund_name, is_active FROM funds')
    .all() as DbFundRow[];
  const tefasDbRows = dbRows.filter(
    (r) => !LOCAL_ONLY_FUND_CODES.has(r.fund_code.toUpperCase())
  );
  const dbCodes = new Set(tefasDbRows.map((r) => r.fund_code.toUpperCase()));

  const added: AddedFund[] = current
    .filter((f) => !dbCodes.has(f.code))
    .map((f) => ({ code: f.code, name: f.name || f.code, isTaxFree: isTaxFreeByName(f.name) }));

  const missing: MissingFund[] = tefasDbRows
    .filter((r) => !currentCodes.has(r.fund_code.toUpperCase()))
    .map((r) => ({ code: r.fund_code, name: r.fund_name }));

  return { added, missing, tefasCount: current.length, dbCount: tefasDbRows.length };
}

export interface ApplyResult {
  added: number;
  deactivated: number;
  reactivated: number;
  tefasCount: number;
}

/**
 * Commit the reconciliation: insert new funds, and set is_active=1 for funds
 * present on TEFAS / is_active=0 for those missing. No deletes.
 */
export async function applyFundList(): Promise<ApplyResult> {
  const current = await fetchCurrentFundList(LIST_KINDS);
  const currentCodes = new Set(current.map((f) => f.code));

  const dbRows = db
    .prepare('SELECT fund_code, is_active FROM funds')
    .all() as Array<{ fund_code: string; is_active: number }>;
  const dbCodes = new Set(dbRows.map((r) => r.fund_code.toUpperCase()));

  const insert = db.prepare(
    'INSERT OR IGNORE INTO funds (fund_code, fund_name, is_tax_free, is_active) VALUES (?, ?, ?, 1)'
  );
  const setActive = db.prepare('UPDATE funds SET is_active = ? WHERE fund_code = ?');

  let added = 0;
  let deactivated = 0;
  let reactivated = 0;

  const txn = db.transaction(() => {
    for (const f of current) {
      if (!dbCodes.has(f.code)) {
        insert.run(f.code, f.name || f.code, isTaxFreeByName(f.name) ? 1 : 0);
        added += 1;
      }
    }
    for (const r of dbRows) {
      if (LOCAL_ONLY_FUND_CODES.has(r.fund_code.toUpperCase())) continue;
      const active = currentCodes.has(r.fund_code.toUpperCase()) ? 1 : 0;
      if (active !== r.is_active) {
        setActive.run(active, r.fund_code);
        if (active === 0) deactivated += 1;
        else reactivated += 1;
      }
    }
  });
  txn();

  return { added, deactivated, reactivated, tefasCount: current.length };
}
