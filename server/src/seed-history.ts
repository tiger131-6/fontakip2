/**
 * Full historical price sync for ALL funds.
 *
 * WHY NOT ONE-REQUEST-PER-FUND?
 * The new TEFAS API hard-rejects any range over ~1 month ("Tarih aralığı 1 ayı
 * aşamaz"). Fetching 2015→today per fund would need ~140 monthly requests PER
 * fund × 1014 funds ≈ 140k requests (~78h) and would get the IP banned.
 *
 * Instead we loop by MONTH WINDOW and omit the fund code, so a single request
 * returns EVERY fund for that window. ~78 windows × 1 fund type (YAT only) ≈ 78
 * requests (~3 min at the strict 2s throttle) covers the entire history for all
 * 1014 Menkul Kıymet Yatırım Fonları. We then keep only the rows whose code is in
 * our `funds` table and
 * `INSERT OR IGNORE` them (idempotent thanks to the UNIQUE(fund_code,
 * price_date) index — safe to re-run).
 */

import {
  TRADING_LOOKBACK_DAYS,
  daysBeforeIso,
  todayIso,
} from './trading-lookback';
import db from './db';
import { fetchWindowAllFunds, splitRange, TEFAS_MAX_WINDOW_DAYS } from './tefas';
import { invalidateReturnsCache } from './fund-returns-db';

/** Earliest date we attempt; older months simply return no rows. */
export const FULL_HISTORY_START = '2020-01-01';
/** Menkul Kıymet Yatırım Fonları only — matches our 1014-fund universe. */
const KINDS = ['YAT'] as const;

const stmtInsertIgnore = db.prepare(
  'INSERT OR IGNORE INTO price_history (fund_code, price_date, price) VALUES (?, ?, ?)'
);
const stmtUpsertPrice = db.prepare(`
  INSERT INTO price_history (fund_code, price_date, price) VALUES (?, ?, ?)
  ON CONFLICT(fund_code, price_date) DO UPDATE SET price = excluded.price
`);

// Bulk insert in one transaction; returns rows written.
const insertMany = db.transaction(
  (rows: Array<{ code: string; date: string; price: number }>, mode: 'ignore' | 'replace') => {
    const stmt = mode === 'replace' ? stmtUpsertPrice : stmtInsertIgnore;
    let written = 0;
    for (const r of rows) written += stmt.run(r.code, r.date, r.price).changes;
    return written;
  }
);

function allFundCodes(): Set<string> {
  const rows = db
    .prepare('SELECT fund_code FROM funds WHERE is_active = 1')
    .all() as Array<{ fund_code: string }>;
  return new Set(rows.map((r) => r.fund_code.toUpperCase()));
}

/** Short-range bulk updates (all ~1014 YAT funds → today). */
export const INCREMENTAL_RANGES = {
  /** Last 7 calendar days — catches prior trading day on weekends/holidays. */
  daily: { label: 'Günlük', days: TRADING_LOOKBACK_DAYS },
  weekly: { label: 'Haftalık', days: 7 },
  monthly: { label: 'Aylık', days: 28 },
} as const;

export type IncrementalRange = keyof typeof INCREMENTAL_RANGES;

export function startDateForRange(range: IncrementalRange): string {
  const end = todayIso();
  const days = INCREMENTAL_RANGES[range].days;
  return daysBeforeIso(end, days);
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export interface SyncProgress {
  /** 1-based index of the current step (window × kind). */
  current: number;
  /** Total number of steps. */
  total: number;
  /** 'processing' | 'warn' | 'done' | 'stopped' */
  status: 'processing' | 'warn' | 'done' | 'stopped';
  /** Human label, e.g. "2016-01-01 → 2016-01-28". */
  currentRange?: string;
  /** Fund type being swept for this step. */
  kind?: string;
  /** Records inserted so far (cumulative). */
  inserted: number;
  /** Distinct funds that received at least one price (cumulative). */
  fundsWithData: number;
  /** Non-fatal warning (a single window failed and was skipped). */
  message?: string;
}

export interface SyncResult {
  completed: boolean;
  stopped: boolean;
  inserted: number;
  fundsWithData: number;
  total: number;
  current: number;
  startDate: string;
}

/**
 * Run the full-history sweep. `onProgress` is called after EACH window request;
 * `shouldStop` lets the caller abort (e.g. when the SSE client disconnects).
 */
export async function runPriceWindowSync(opts: {
  startDate: string;
  onProgress: (p: SyncProgress) => void;
  shouldStop: () => boolean;
  /** 'replace' overwrites existing rows (recent sync); 'ignore' skips duplicates (full history). */
  writeMode?: 'ignore' | 'replace';
  /** Shorter timeouts for startup / incremental sync when TEFAS is unreachable. */
  failFast?: boolean;
}): Promise<SyncResult> {
  const codes = allFundCodes();
  const startDate = opts.startDate;
  const writeMode = opts.writeMode ?? 'ignore';
  const failFast = opts.failFast === true;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date();

  const windows = splitRange(start, end, TEFAS_MAX_WINDOW_DAYS);
  const total = windows.length * KINDS.length;

  let step = 0;
  let inserted = 0;
  const fundsWithData = new Set<string>();

  opts.onProgress({
    current: 0,
    total,
    status: 'processing',
    currentRange: `${startDate} → ${fmt(end)}`,
    kind: KINDS[0],
    inserted: 0,
    fundsWithData: 0,
    message: 'TEFAS fiyatları güncelleniyor...',
  });

  for (const [ws, we] of windows) {
    const currentRange = `${fmt(ws)} → ${fmt(we)}`;
    for (const kind of KINDS) {
      if (opts.shouldStop()) {
        return {
          completed: false,
          stopped: true,
          inserted,
          fundsWithData: fundsWithData.size,
          total,
          current: step,
          startDate,
        };
      }

      step += 1;
      opts.onProgress({
        current: step,
        total,
        status: 'processing',
        currentRange,
        kind,
        inserted,
        fundsWithData: fundsWithData.size,
      });

      try {
        const rows = await fetchWindowAllFunds(kind, ws, we, { failFast });
        const relevant = rows.filter((r) => codes.has(r.code));
        if (relevant.length > 0) {
          inserted += insertMany(relevant, writeMode);
          for (const r of relevant) fundsWithData.add(r.code);
        }
      } catch (err) {
        opts.onProgress({
          current: step,
          total,
          status: 'warn',
          currentRange,
          kind,
          inserted,
          fundsWithData: fundsWithData.size,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (writeMode === 'replace' && inserted > 0) {
    invalidateReturnsCache();
  }

  return {
    completed: true,
    stopped: false,
    inserted,
    fundsWithData: fundsWithData.size,
    total,
    current: step,
    startDate,
  };
}

/** Full history from 2020 — INSERT OR IGNORE (safe to re-run). */
export async function runFullHistorySync(opts: {
  startDate?: string;
  onProgress: (p: SyncProgress) => void;
  shouldStop: () => boolean;
}): Promise<SyncResult> {
  return runPriceWindowSync({
    startDate: opts.startDate || FULL_HISTORY_START,
    onProgress: opts.onProgress,
    shouldStop: opts.shouldStop,
    writeMode: 'ignore',
  });
}

/** Günlük / Haftalık / Aylık — all active funds, INSERT OR REPLACE. */
export async function runIncrementalSync(opts: {
  range: IncrementalRange;
  onProgress: (p: SyncProgress) => void;
  shouldStop: () => boolean;
}): Promise<SyncResult> {
  return runPriceWindowSync({
    startDate: startDateForRange(opts.range),
    onProgress: opts.onProgress,
    shouldStop: opts.shouldStop,
    writeMode: 'replace',
    failFast: true,
  });
}
