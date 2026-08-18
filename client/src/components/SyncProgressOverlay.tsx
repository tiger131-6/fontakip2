interface Props {
  isSyncing: boolean;
  progress: number;
  statusText: string;
  onSkip?: () => void;
}

export default function SyncProgressOverlay({ isSyncing, progress, statusText, onSkip }: Props) {
  if (!isSyncing) return null;

  const pct = Math.round(Math.min(100, Math.max(0, progress)));
  const complete = pct >= 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-overlay-title"
      aria-describedby="sync-overlay-status"
    >
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-8 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 ${
              complete ? '' : 'animate-spin'
            }`}
            aria-hidden
          >
            {complete ? (
              <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
          </div>
          <div>
            <h2 id="sync-overlay-title" className="text-lg font-bold tracking-tight text-gray-100">
              Sistem Başlatılıyor
            </h2>
            <p className="text-[11px] font-medium uppercase tracking-widest text-amber-500/90">
              Fon Takip Programı
            </p>
          </div>
        </div>

        <p id="sync-overlay-status" className="mt-6 min-h-[2.5rem] text-sm leading-relaxed text-gray-300">
          {statusText || 'Piyasa verileri senkronize ediliyor...'}
        </p>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold tabular-nums">
            <span className="text-gray-500">İlerleme</span>
            <span className={complete ? 'text-emerald-400' : 'text-amber-400'}>{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-800 ring-1 ring-inset ring-gray-700">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                complete ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <p className="mt-5 text-center text-[10px] text-gray-600">
          Günlük otomatik senkronizasyon · TEFAS (7 gün geriye dönük)
        </p>

        {onSkip && !complete && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-4 w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:bg-gray-700 hover:text-gray-100"
          >
            Atla ve devam et
          </button>
        )}
      </div>
    </div>
  );
}
