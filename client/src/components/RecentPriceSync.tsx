import { useEffect, useRef, useState } from 'react';
import type { SyncProgress, SyncResult } from '../types';
import { dispatchSyncFinished, getLastSync, subscribeSyncFinished, syncSourceLabel, type SyncFinishedDetail, type SyncFinishedSource } from '../syncEvents';
import { assertSyncStreamReady, connectSyncEventSource, fetchSyncLockStatus } from '../utils/syncEventSource';

export type IncrementalRange = 'daily' | 'weekly' | 'monthly';

type Phase = 'idle' | 'running' | 'done' | 'error';

interface IncrementalResult extends SyncResult {
  range: IncrementalRange;
  label: string;
}

const RANGES: Array<{
  range: IncrementalRange;
  label: string;
  days: number;
  hint: string;
  color: string;
  finishedSource: SyncFinishedSource;
}> = [
  {
    range: 'daily',
    label: 'Günlük',
    days: 7,
    hint: 'Son 7 gün (son işlem günü)',
    color: 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800',
    finishedSource: 'recent-daily',
  },
  {
    range: 'weekly',
    label: 'Haftalık',
    days: 7,
    hint: 'Son 7 gün',
    color: 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800',
    finishedSource: 'recent-weekly',
  },
  {
    range: 'monthly',
    label: 'Aylık',
    days: 28,
    hint: 'Son 28 gün',
    color: 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800',
    finishedSource: 'recent-monthly',
  },
];

interface Props {
  onFinished?: () => void;
  disabled?: boolean;
  onRunningChange?: (running: boolean) => void;
}

export default function RecentPriceSync({ onFinished, disabled, onRunningChange }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeRange, setActiveRange] = useState<IncrementalRange | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<IncrementalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncFinishedDetail | null>(() => getLastSync());

  const esRef = useRef<{ close: () => void } | null>(null);
  const [serverBusy, setServerBusy] = useState(false);

  const cleanup = () => {
    esRef.current?.close();
    esRef.current = null;
  };

  useEffect(() => cleanup, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const status = await fetchSyncLockStatus();
      if (!cancelled) setServerBusy(Boolean(status?.syncActive));
    };
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase]);

  useEffect(() => {
    return subscribeSyncFinished((detail) => {
      if (detail.source === 'auto-fonbul' || detail.source.startsWith('recent-')) {
        setLastSync(detail);
      }
    });
  }, []);

  useEffect(() => {
    onRunningChange?.(phase === 'running');
  }, [phase, onRunningChange]);

  const start = async (range: IncrementalRange) => {
    if (phase === 'running' || disabled) return;

    const ready = await assertSyncStreamReady();
    if (!ready.ok) {
      setError(ready.message);
      setPhase('error');
      return;
    }

    cleanup();
    setPhase('running');
    setActiveRange(range);
    setProgress(null);
    setResult(null);
    setError(null);

    esRef.current = connectSyncEventSource<IncrementalResult>(`/sync/recent?range=${range}`, {
      onProgress: (data) => setProgress(data as SyncProgress),
      onDone: (result) => {
        if (result) setResult(result);
        setPhase('done');
        const source = RANGES.find((r) => r.range === range)?.finishedSource ?? 'recent-daily';
        dispatchSyncFinished(source);
        onFinished?.();
      },
      onError: (message) => {
        setError(message);
        setPhase('error');
      },
    });
  };

  const running = phase === 'running';
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : phase === 'done'
        ? 100
        : 0;

  const activeMeta = activeRange ? RANGES.find((r) => r.range === activeRange) : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-600">
            ↻
          </span>
          Kısa Vadeli Fiyat Güncelleme
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
          Tüm aktif <strong>1014 fon</strong> için önce <strong>TEFAS</strong> fiyatlarını, ardından{' '}
          <strong>FonBul</strong> metriklerini günceller — veriler önce yerel veritabanına yazılır.
          Günlük yalnızca <strong>bugünü</strong>, haftalık son <strong>7 günü</strong>, aylık son{' '}
          <strong>28 günü</strong> kapsar. İnternet yalnızca bu güncelleme sırasında kullanılır.
        </p>
        {serverBusy && phase !== 'running' && (
          <p className="mt-2 text-xs text-amber-700">
            Arka planda başka bir güncelleme çalışıyor; bitince butonlar tekrar kullanılabilir olacak.
          </p>
        )}
        {lastSync &&
          (lastSync.source === 'auto-fonbul' || lastSync.source.startsWith('recent-')) && (
            <p className="mt-2 text-xs text-slate-500">
              Son FonBul güncellemesi:{' '}
              <span className="font-medium text-slate-700">
                {new Date(lastSync.at).toLocaleString('tr-TR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {' · '}
              <span className="font-medium text-violet-700">{syncSourceLabel(lastSync.source)}</span>
            </p>
          )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {RANGES.map((r) => {
          const isActive = running && activeRange === r.range;
          return (
            <button
              key={r.range}
              type="button"
              onClick={() => void start(r.range)}
              disabled={disabled || running || serverBusy}
              title={r.hint}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                disabled || running
                  ? isActive
                    ? 'cursor-wait bg-slate-400'
                    : 'cursor-not-allowed bg-slate-200 text-slate-400'
                  : r.color
              }`}
            >
              {isActive ? `${r.label} güncelleniyor…` : r.label}
            </button>
          );
        })}
      </div>

      {(running || phase === 'done') && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>
              {activeMeta && (
                <span className="mr-2 font-semibold text-violet-700">{activeMeta.label}</span>
              )}
              {progress
                ? `[${progress.current}/${progress.total}]${
                    progress.kind ? ` ${progress.kind}` : ''
                  } ${progress.message ?? progress.currentRange ?? ''}`
                : 'Başlatılıyor…'}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                phase === 'done' ? 'bg-emerald-500' : 'bg-violet-600'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
              <span>
                İşlenen kayıt:{' '}
                <strong className="tabular-nums text-slate-700">
                  {progress.inserted.toLocaleString('tr-TR')}
                </strong>
              </span>
              <span>
                Veri gelen fon:{' '}
                <strong className="tabular-nums text-slate-700">{progress.fundsWithData}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && result && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          <strong>{result.label}</strong> güncelleme tamamlandı!{' '}
          {result.tefasInserted != null && result.fonbulInserted != null ? (
            <>
              TEFAS: <strong>{result.tefasInserted.toLocaleString('tr-TR')}</strong> fiyat · FonBul:{' '}
              <strong>{result.fonbulInserted.toLocaleString('tr-TR')}</strong> metrik satırı (
              {result.fonbulFundsWithData ?? 0} fon) · Toplam{' '}
              <strong>{result.inserted.toLocaleString('tr-TR')}</strong> ({result.startDate} → bugün).
            </>
          ) : (
            <>
              <strong>{result.inserted.toLocaleString('tr-TR')}</strong> kayıt işlendi,{' '}
              <strong>{result.fundsWithData}</strong> fon için veri alındı ({result.startDate} → bugün).
            </>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error ?? 'Güncelleme sırasında bir hata oluştu.'}
        </div>
      )}
    </div>
  );
}
