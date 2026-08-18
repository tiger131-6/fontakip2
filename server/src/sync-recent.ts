import {
  runIncrementalSync,
  startDateForRange,
  type IncrementalRange,
  type SyncProgress,
  type SyncResult,
  INCREMENTAL_RANGES,
} from './seed-history';
import { listFonbulFundCodes, runFonbulIncrementalSync } from './fonbul';

export interface CombinedIncrementalResult extends SyncResult {
  range: IncrementalRange;
  label: string;
  tefasInserted: number;
  fonbulInserted: number;
  fonbulFundsWithData: number;
}

/**
 * TEFAS fiyatları + FonBul metrikleri — günlük / haftalık / aylık kısa vadeli güncelleme.
 */
export async function runCombinedIncrementalSync(opts: {
  range: IncrementalRange;
  onProgress: (p: SyncProgress) => void;
  shouldStop: () => boolean;
  /** Startup auto-sync: TEFAS only — FonBul is too slow to block the UI. */
  skipFonbul?: boolean;
  /** Background FonBul-only pass after TEFAS auto-sync (no duplicate TEFAS fetch). */
  skipTefas?: boolean;
}): Promise<CombinedIncrementalResult> {
  const startDate = startDateForRange(opts.range);
  const label = INCREMENTAL_RANGES[opts.range].label;

  if (opts.skipTefas) {
    const fonbulTotal = listFonbulFundCodes().length;
    opts.onProgress({
      current: 0,
      total: Math.max(fonbulTotal, 1),
      status: 'processing',
      kind: 'FonBul',
      inserted: 0,
      fundsWithData: 0,
      currentRange: `${startDate} → bugün`,
      message: 'FonBul metrikleri güncelleniyor...',
    });

    const fonbulResult = await runFonbulIncrementalSync({
      startDate,
      range: opts.range,
      onProgress: (p) => {
        const status =
          p.status === 'scraping' ? 'processing' : p.status === 'warn' ? 'warn' : 'processing';
        opts.onProgress({
          current: p.current,
          total: Math.max(p.total, 1),
          status,
          currentRange: `${startDate} → bugün`,
          kind: 'FonBul',
          inserted: p.inserted,
          fundsWithData: 0,
          message: p.status === 'warn' ? p.message : `FonBul · ${p.currentFund}`,
        });
      },
      shouldStop: opts.shouldStop,
    });

    const stopped = opts.shouldStop() || fonbulResult.stopped;

    return {
      completed: fonbulResult.completed && !stopped,
      stopped,
      inserted: fonbulResult.inserted,
      fundsWithData: fonbulResult.fundsWithData,
      total: fonbulResult.total,
      current: fonbulResult.current,
      startDate,
      range: opts.range,
      label,
      tefasInserted: 0,
      fonbulInserted: fonbulResult.inserted,
      fonbulFundsWithData: fonbulResult.fundsWithData,
    };
  }

  opts.onProgress({
    current: 0,
    total: 1,
    status: 'processing',
    kind: 'TEFAS',
    inserted: 0,
    fundsWithData: 0,
    currentRange: `${startDate} → bugün`,
    message: 'TEFAS fiyatları güncelleniyor...',
  });

  const tefasResult = await runIncrementalSync({
    range: opts.range,
    onProgress: (p) =>
      opts.onProgress({
        ...p,
        kind: 'TEFAS',
        currentRange: p.currentRange ?? `${startDate} → bugün`,
      }),
    shouldStop: opts.shouldStop,
  });

  if (opts.shouldStop()) {
    return {
      ...tefasResult,
      range: opts.range,
      label,
      tefasInserted: tefasResult.inserted,
      fonbulInserted: 0,
      fonbulFundsWithData: 0,
    };
  }

  if (opts.skipFonbul) {
    opts.onProgress({
      current: tefasResult.total,
      total: tefasResult.total,
      status: 'done',
      kind: 'TEFAS',
      inserted: tefasResult.inserted,
      fundsWithData: tefasResult.fundsWithData,
      message:
        tefasResult.inserted > 0
          ? 'TEFAS güncellemesi tamamlandı.'
          : 'TEFAS yanıt vermedi; mevcut fiyatlar korunuyor.',
    });
    return {
      completed: tefasResult.completed && !opts.shouldStop(),
      stopped: opts.shouldStop(),
      inserted: tefasResult.inserted,
      fundsWithData: tefasResult.fundsWithData,
      total: tefasResult.total,
      current: tefasResult.current,
      startDate,
      range: opts.range,
      label,
      tefasInserted: tefasResult.inserted,
      fonbulInserted: 0,
      fonbulFundsWithData: 0,
    };
  }

  const fonbulTotal = listFonbulFundCodes().length;
  const tefasOffset = tefasResult.total;

  const fonbulResult = await runFonbulIncrementalSync({
    startDate,
    range: opts.range,
    onProgress: (p) => {
      const status =
        p.status === 'scraping' ? 'processing' : p.status === 'warn' ? 'warn' : 'processing';
      opts.onProgress({
        current: tefasOffset + p.current,
        total: tefasOffset + p.total,
        status,
        currentRange: `${startDate} → bugün`,
        kind: 'FonBul',
        inserted: tefasResult.inserted + p.inserted,
        fundsWithData: tefasResult.fundsWithData,
        message: p.status === 'warn' ? p.message : `FonBul · ${p.currentFund}`,
      });
    },
    shouldStop: opts.shouldStop,
  });

  const stopped = opts.shouldStop() || fonbulResult.stopped;

  return {
    completed: tefasResult.completed && fonbulResult.completed && !stopped,
    stopped,
    inserted: tefasResult.inserted + fonbulResult.inserted,
    fundsWithData: tefasResult.fundsWithData,
    total: tefasOffset + fonbulTotal,
    current: tefasOffset + fonbulResult.current,
    startDate,
    range: opts.range,
    label,
    tefasInserted: tefasResult.inserted,
    fonbulInserted: fonbulResult.inserted,
    fonbulFundsWithData: fonbulResult.fundsWithData,
  };
}
