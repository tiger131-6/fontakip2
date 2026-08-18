import { useEffect, useState } from 'react';
import type { UpdaterMessage } from '../types/electron';

export default function UpdaterUI() {
  const [updateStatus, setUpdateStatus] = useState<UpdaterMessage | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsubMessage = api.onUpdaterMessage((data) => {
      if (data.status === 'up-to-date') return;
      setUpdateStatus(data);
      if (data.status === 'available' || data.status === 'checking') {
        setProgress(0);
      }
    });

    const unsubProgress = api.onUpdaterProgress((percent) => {
      setProgress(Math.round(percent));
      setUpdateStatus((prev) =>
        prev?.status === 'downloaded' || prev?.status === 'error'
          ? prev
          : { status: 'downloading', text: 'Güncelleme indiriliyor…', version: prev?.version }
      );
    });

    return () => {
      unsubMessage();
      unsubProgress();
    };
  }, []);

  if (!updateStatus) return null;

  const isDownloading =
    updateStatus.status === 'available' ||
    updateStatus.status === 'downloading' ||
    (updateStatus.status === 'checking' && progress > 0);
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      role="status"
      aria-live="polite"
    >
      <h3 className="text-sm font-bold text-slate-800">Sistem Güncellemesi</h3>
      <p
        className={`mt-1 text-xs ${
          updateStatus.status === 'error' ? 'text-rose-700' : 'text-slate-600'
        }`}
      >
        {updateStatus.text}
      </p>

      {updateStatus.status === 'checking' && progress === 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
            aria-hidden
          />
          Kontrol ediliyor…
        </div>
      )}

      {isDownloading && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold tabular-nums text-slate-500">
            <span>İndirme</span>
            <span className="text-indigo-600">{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {updateStatus.status === 'downloaded' && (
        <button
          type="button"
          onClick={() => window.electronAPI?.restartAndInstall()}
          className="mt-3 w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
        >
          Yeniden Başlat ve Yükle
        </button>
      )}

      {updateStatus.status === 'error' && (
        <button
          type="button"
          onClick={() => setUpdateStatus(null)}
          className="mt-3 w-full rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Kapat
        </button>
      )}
    </div>
  );
}
