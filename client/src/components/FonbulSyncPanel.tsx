import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { FonbulScrapeProgress, FonbulScrapeResult } from '../types';
import { dispatchSyncFinished, getLastSync, subscribeSyncFinished, syncSourceLabel, type SyncFinishedDetail } from '../syncEvents';
import { assertSyncStreamReady, connectSyncEventSource } from '../utils/syncEventSource';

type Phase = 'idle' | 'running' | 'done' | 'error';

interface Props {
  onFinished?: () => void;
  disabled?: boolean;
  onRunningChange?: (running: boolean) => void;
}

/**
 * Full FonBul metrics sync — SSE to GET /api/fonbul/scrape-all.
 * Persists price + portföy metrikleri into local SQLite (price_history).
 */
export default function FonbulSyncPanel({ onFinished, disabled, onRunningChange }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<FonbulScrapeProgress | null>(null);
  const [result, setResult] = useState<FonbulScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncFinishedDetail | null>(() => getLastSync());

  const esRef = useRef<{ close: () => void } | null>(null);
  const toastIdRef = useRef<string | null>(null);

  const cleanup = () => {
    esRef.current?.close();
    esRef.current = null;
  };

  useEffect(() => cleanup, []);

  useEffect(() => {
    return subscribeSyncFinished((detail) => {
      if (
        detail.source === 'auto-fonbul' ||
        detail.source === 'fonbul-full' ||
        detail.source === 'recent-daily' ||
        detail.source === 'recent-weekly' ||
        detail.source === 'recent-monthly'
      ) {
        setLastSync(detail);
      }
    });
  }, []);

  useEffect(() => {
    onRunningChange?.(phase === 'running');
  }, [phase, onRunningChange]);

  const start = async () => {
    if (phase === 'running' || disabled) return;

    const ready = await assertSyncStreamReady({ requireFonbulSlot: true });
    if (!ready.ok) {
      setError(ready.message);
      setPhase('error');
      toast.error(ready.message);
      return;
    }

    setPhase('running');
    setProgress(null);
    setResult(null);
    setError(null);

    const toastId = toast.loading('FonBul verileri senkronize ediliyor...');
    toastIdRef.current = toastId;

    esRef.current = connectSyncEventSource<FonbulScrapeResult>('/fonbul/scrape-all', {
      onProgress: (data) => setProgress(data as FonbulScrapeProgress),
      onDone: (result) => {
        if (result) setResult(result);
        setPhase('done');
        toast.success('Senkronizasyon başarıyla tamamlandı!', { id: toastIdRef.current ?? undefined });
        toastIdRef.current = null;
        dispatchSyncFinished('fonbul-full');
        onFinished?.();
      },
      onError: (message) => {
        setError(message);
        setPhase('error');
        toast.error(message, { id: toastIdRef.current ?? undefined });
        toastIdRef.current = null;
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-100 text-teal-600">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M3 12v3c0 1.1.9 2 2 2h10a2 2 0 002-2v-3H3zm0-2h14V7c0-1.1-.9-2-2-2H5a2 2 0 00-2 2v3zm2-6h10a2 2 0 012 2v1H3V6a2 2 0 012-2z" />
              </svg>
            </span>
            FonBul Senkronizasyonu
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            Tüm fonlar için FonBul&apos;dan <strong>2020&apos;den</strong> bugüne fiyat ve gelişmiş
            metrikleri (portföy değeri, toplam pay değeri, tedavüldeki pay, yatırımcı adedi, aktif
            değeri, doluluk %) çeker ve <strong>yerel veritabanına</strong> kaydeder — TEFAS tam
            geçmiş gibi <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">funds.db</code>{' '}
            içindeki <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">price_history</code>{' '}
            tablosuna. <strong>50 paralel istek</strong> kullanır; tekrar çalıştırılabilir.
          </p>
          {lastSync &&
            (lastSync.source === 'auto-fonbul' ||
              lastSync.source === 'fonbul-full' ||
              lastSync.source.startsWith('recent-')) && (
              <p className="mt-2 text-xs text-slate-500">
                Son güncelleme:{' '}
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
                <span className="font-medium text-teal-700">{syncSourceLabel(lastSync.source)}</span>
              </p>
            )}
        </div>

        <button
          type="button"
          onClick={() => void start()}
          disabled={disabled || running}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
            disabled || running
              ? 'cursor-not-allowed bg-slate-400'
              : 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800'
          }`}
        >
          {running ? 'Senkronize ediliyor…' : 'FonBul Senkronizasyonu'}
        </button>
      </div>

      {(running || phase === 'done') && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>
              {progress
                ? `[${progress.current}/${progress.total}] ${progress.currentFund}`
                : 'Başlatılıyor…'}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                phase === 'done' ? 'bg-emerald-500' : 'bg-teal-600'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {progress && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
              <span>
                Kaydedilen satır:{' '}
                <strong className="text-slate-700 tabular-nums">
                  {progress.inserted.toLocaleString('tr-TR')}
                </strong>
              </span>
              {progress.status === 'warn' && progress.message && (
                <span className="text-amber-600">⚠ {progress.message}</span>
              )}
            </div>
          )}
        </div>
      )}

      {phase === 'done' && result && (
        <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          {result.stopped ? 'Senkronizasyon durduruldu. ' : 'FonBul senkronizasyonu tamamlandı! '}
          <strong>{result.inserted.toLocaleString('tr-TR')}</strong> metrik satırı yerel veritabanına
          kaydedildi
          {result.fundsWithData != null && (
            <>
              , <strong>{result.fundsWithData}</strong> fon için veri alındı
            </>
          )}{' '}
          (2020-01-01 → bugün).
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error ?? 'FonBul senkronizasyonu sırasında bir hata oluştu.'}
        </div>
      )}
    </div>
  );
}
