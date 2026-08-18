import { useEffect, useRef, useState } from 'react';
import type { SyncProgress, SyncResult, FundListDiff } from '../types';
import { checkFundList, applyFundList } from '../api';
import RecentPriceSync from './RecentPriceSync';
import FonbulSyncPanel from './FonbulSyncPanel';
import { subscribeSyncFinished } from '../syncEvents';
import { assertSyncStreamReady, connectSyncEventSource } from '../utils/syncEventSource';

type Phase = 'idle' | 'running' | 'done' | 'error';

/**
 * Data Synchronization panel.
 *
 * Opens an SSE connection to GET /api/seed/start and renders live progress for
 * the full-history sweep of all funds. The button is disabled while a sync is
 * running, and the EventSource is closed on completion/error/unmount so the
 * browser never auto-reconnects (which would restart the job).
 */
export default function SyncPanel({ onFinished }: { onFinished?: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Fund-list reconciliation state ---
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [diff, setDiff] = useState<FundListDiff | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [recentRunning, setRecentRunning] = useState(false);
  const [fonbulRunning, setFonbulRunning] = useState(false);

  const esRef = useRef<{ close: () => void } | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    setCheckError(null);
    setApplyMsg(null);
    setDiff(null);
    try {
      setDiff(await checkFundList());
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Fon listesi kontrol edilemedi.');
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setCheckError(null);
    try {
      const res = await applyFundList();
      setApplyMsg(res.message);
      setDiff(null);
      onFinished?.();
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Değişiklikler uygulanamadı.');
    } finally {
      setApplying(false);
    }
  };

  const cleanup = () => {
    esRef.current?.close();
    esRef.current = null;
  };

  useEffect(() => cleanup, []);

  useEffect(() => {
    return subscribeSyncFinished((detail) => {
      if (detail.source === 'auto-fonbul' || detail.source === 'auto-tefas') {
        onFinished?.();
      }
    });
  }, [onFinished]);

  const start = async () => {
    if (phase === 'running') return;

    const ready = await assertSyncStreamReady();
    if (!ready.ok) {
      setError(ready.message);
      setPhase('error');
      return;
    }

    setPhase('running');
    setProgress(null);
    setResult(null);
    setError(null);

    esRef.current = connectSyncEventSource<SyncResult>('/seed/start?start=2020-01-01', {
      onProgress: (data) => setProgress(data as SyncProgress),
      onDone: (result) => {
        if (result) setResult(result);
        setPhase('done');
        onFinished?.();
      },
      onError: (message) => {
        setError(message);
        setPhase('error');
      },
    });
  };

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : phase === 'done'
      ? 100
      : 0;

  const running = phase === 'running';

  return (
    <div className="space-y-6">
      <RecentPriceSync
        onFinished={onFinished}
        disabled={running || fonbulRunning}
        onRunningChange={setRecentRunning}
      />

      <FonbulSyncPanel
        onFinished={onFinished}
        disabled={running || recentRunning}
        onRunningChange={setFonbulRunning}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
                ⟳
              </span>
              Veri Senkronizasyonu — Tam Geçmiş
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              <strong>Menkul Kıymet Yatırım Fonları</strong> için TEFAS geçmiş fiyatlarını (
              <strong>2020&apos;den</strong> bugüne) çeker ve yerel veritabanına işler. Emeklilik
              ve BYF fonları dahil değildir. TEFAS aylık aralık sınırı nedeniyle istekler ay-ay
              yapılır, tahmini süre <strong>~3 dakika</strong>. İşlem tekrar çalıştırılabilir;
              mevcut kayıtlar korunur.
            </p>
          </div>

          <button
            onClick={() => void start()}
            disabled={running || recentRunning || fonbulRunning}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
              running || recentRunning
                ? 'cursor-not-allowed bg-slate-400'
                : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
            }`}
          >
            {running ? 'Senkronize ediliyor…' : 'Tam Geçmişi Senkronize Et'}
          </button>
        </div>

        {(running || phase === 'done') && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600">
              <span>
                {progress
                  ? `[${progress.current}/${progress.total}] ${progress.currentRange ?? ''}${
                      progress.kind ? ` · ${progress.kind}` : ''
                    }`
                  : 'Başlatılıyor…'}
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  phase === 'done' ? 'bg-emerald-500' : 'bg-indigo-600'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {progress && (
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                <span>
                  Eklenen kayıt:{' '}
                  <strong className="text-slate-700 tabular-nums">
                    {progress.inserted.toLocaleString('tr-TR')}
                  </strong>
                </span>
                <span>
                  Veri gelen fon:{' '}
                  <strong className="text-slate-700 tabular-nums">{progress.fundsWithData}</strong>
                </span>
                {progress.status === 'warn' && progress.message && (
                  <span className="text-amber-600">⚠ Atlanan aralık: {progress.message}</span>
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'done' && result && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
            {result.stopped ? 'Senkronizasyon durduruldu. ' : 'Senkronizasyon tamamlandı! '}
            <strong>{result.inserted.toLocaleString('tr-TR')}</strong> yeni fiyat kaydı eklendi,{' '}
            <strong>{result.fundsWithData}</strong> fon için veri alındı (
            {result.startDate} → bugün).
          </div>
        )}

        {phase === 'error' && (
          <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            {error ?? 'Senkronizasyon sırasında bir hata oluştu.'}
          </div>
        )}

      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-sky-600">
                  ⇄
                </span>
                Fon Listesi Kontrolü — TEFAS
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                TEFAS web sitesindeki <strong>Menkul Kıymet Yatırım Fonları</strong> tablosunu
                (~1014 fon) yereldeki listeyle karşılaştırır: <strong>yeni eklenen</strong> ve{' '}
                <strong>artık listede olmayan</strong> fonları gösterir. Uygulamak isterseniz yeni
                fonlar eklenir (vergi durumu otomatik belirlenir), kayıp fonlar{' '}
                <strong>pasif</strong> işaretlenir — hiçbir fon veya geçmiş silinmez.
              </p>
            </div>

            <button
              onClick={handleCheck}
              disabled={checking || applying}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition ${
                checking || applying
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                  : 'bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800'
              }`}
            >
              {checking ? 'Kontrol ediliyor…' : 'Fon Listesini Kontrol Et'}
            </button>
          </div>

          {checkError && (
            <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {checkError}
            </div>
          )}

          {applyMsg && (
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
              {applyMsg}
            </div>
          )}

          {diff && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                <span>
                  TEFAS: <strong className="tabular-nums">{diff.tefasCount}</strong> fon
                </span>
                <span>
                  Yerel: <strong className="tabular-nums">{diff.dbCount}</strong> fon
                </span>
                <span className="text-emerald-700">
                  ➕ Yeni: <strong className="tabular-nums">{diff.added.length}</strong>
                </span>
                <span className="text-amber-700">
                  ➖ Listede yok: <strong className="tabular-nums">{diff.missing.length}</strong>
                </span>
              </div>

              {diff.added.length === 0 && diff.missing.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Liste güncel — fark bulunamadı. 🎉
                </p>
              ) : (
                <>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {diff.added.length > 0 && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40">
                        <div className="border-b border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800">
                          Yeni fonlar ({diff.added.length})
                        </div>
                        <div className="max-h-48 overflow-y-auto p-2 text-xs">
                          {diff.added.map((f) => (
                            <div key={f.code} className="flex items-start gap-2 px-1 py-1">
                              <span className="font-mono font-semibold text-emerald-700">
                                {f.code}
                              </span>
                              <span className="flex-1 text-slate-600">{f.name}</span>
                              {f.isTaxFree && (
                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                  Vergisiz
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {diff.missing.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/40">
                        <div className="border-b border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800">
                          Listede olmayanlar ({diff.missing.length})
                        </div>
                        <div className="max-h-48 overflow-y-auto p-2 text-xs">
                          {diff.missing.map((f) => (
                            <div key={f.code} className="flex items-start gap-2 px-1 py-1">
                              <span className="font-mono font-semibold text-amber-700">
                                {f.code}
                              </span>
                              <span className="flex-1 text-slate-600">{f.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                      applying
                        ? 'cursor-not-allowed bg-slate-400'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                    }`}
                  >
                    {applying ? 'Uygulanıyor…' : 'Değişiklikleri Uygula'}
                  </button>
                </>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
