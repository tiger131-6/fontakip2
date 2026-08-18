import { useCallback, useEffect, useRef, useState } from 'react';

import toast from 'react-hot-toast';

import { apiUrl, getApiBase, isNativeApp } from '../config/apiBase';

import type { SyncProgress } from '../types';

import { dispatchSyncFinished } from '../syncEvents';



const STORAGE_KEY = 'last_auto_sync';

/** Startup overlay must not block the app indefinitely. */

const AUTO_SYNC_MAX_MS = 90_000;

/** Max wait for TEFAS / other SSE jobs to release the global sync lock. */

const SYNC_IDLE_MAX_MS = 180_000;



/** 08:00 local time — most recent daily reset boundary (TRT when system TZ is Turkey). */

export function getResetThreshold(now = new Date()): Date {

  const threshold = new Date(now);

  threshold.setHours(8, 0, 0, 0);

  if (now < threshold) {

    threshold.setDate(threshold.getDate() - 1);

  }

  return threshold;

}



export function shouldRunAutoSync(now = new Date()): boolean {

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) return true;

  const last = new Date(raw);

  if (Number.isNaN(last.getTime())) return true;

  return last < getResetThreshold(now);

}



/** Dev-only: open app with ?forceAutoSync=1 to trigger overlay without waiting for 08:00 window. */

export function shouldForceAutoSync(): boolean {

  if (!import.meta.env.DEV) return false;

  return new URLSearchParams(window.location.search).has('forceAutoSync');

}



/** Dev-only: ?resetAutoSync=1 clears last_auto_sync and runs startup sync again. */

export function shouldResetAutoSync(): boolean {

  if (!import.meta.env.DEV) return false;

  return new URLSearchParams(window.location.search).has('resetAutoSync');

}



function statusFromProgress(p: SyncProgress): string {

  if (p.kind === 'TEFAS') {

    return p.message ? `TEFAS: ${p.message}` : 'TEFAS fiyatları güncelleniyor...';

  }

  if (p.kind === 'FonBul') {

    return p.message ? `FonBul: ${p.message}` : 'FonBul veritabanı güncelleniyor...';

  }

  return p.message ?? 'Piyasa verileri senkronize ediliyor...';

}



function pctFromProgress(p: SyncProgress): number {

  if (p.total <= 0) return 0;

  return Math.min(99, (p.current / p.total) * 100);

}



function sleep(ms: number): Promise<void> {

  return new Promise((resolve) => setTimeout(resolve, ms));

}



async function fetchSyncStatus(): Promise<{ syncActive: boolean; fonbulSyncActive: boolean } | null> {

  try {

    const res = await fetch(apiUrl('/sync/status'));

    if (!res.ok) return null;

    return (await res.json()) as { syncActive: boolean; fonbulSyncActive: boolean };

  } catch {

    return null;

  }

}



/** Block until no SSE sync job holds the server-wide lock. */

async function waitForSyncIdle(maxMs = SYNC_IDLE_MAX_MS): Promise<void> {

  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {

    const status = await fetchSyncStatus();

    if (status && !status.syncActive && !status.fonbulSyncActive) return;

    await sleep(2000);

  }

  throw new Error('Senkronizasyon kilidi zaman aşımına uğradı.');

}



function runSseSync(url: string, handlers: { onProgress: (p: SyncProgress) => void }): Promise<void> {

  return new Promise((resolve, reject) => {

    const es = new EventSource(url);

    let finished = false;



    const finish = (fn: () => void) => {

      if (finished) return;

      finished = true;

      es.close();

      fn();

    };



    es.addEventListener('progress', (ev) => {

      try {

        handlers.onProgress(JSON.parse((ev as MessageEvent).data) as SyncProgress);

      } catch {

        /* ignore malformed progress */

      }

    });



    es.addEventListener('done', () => finish(resolve));



    es.addEventListener('error', (ev) => {

      const data = (ev as MessageEvent).data;

      if (data) {

        try {

          const parsed = JSON.parse(data) as { message?: string };

          finish(() => reject(new Error(parsed.message ?? 'Senkronizasyon hatası.')));

        } catch {

          finish(() => reject(new Error('Senkronizasyon hatası.')));

        }

        return;

      }

      finish(() => reject(new Error('Sunucu bağlantısı kesildi.')));

    });

  });

}



/** Daily TEFAS-only sync for the startup overlay (fast, non-blocking). */

function runDailyTefasSync(

  handlers: { onProgress: (p: SyncProgress) => void },

  options?: { maxMs?: number; signal?: AbortSignal }

): Promise<void> {

  return new Promise((resolve, reject) => {

    const es = new EventSource(apiUrl('/sync/recent?range=daily&skipFonbul=1'));

    let finished = false;



    const finish = (fn: () => void) => {

      if (finished) return;

      finished = true;

      if (timer) clearTimeout(timer);

      es.close();

      fn();

    };



    const timer =

      options?.maxMs != null

        ? setTimeout(() => {

            finish(() => reject(new Error('Senkronizasyon zaman aşımına uğradı.')));

          }, options.maxMs)

        : null;



    const onAbort = () => {

      finish(() => reject(new Error('Senkronizasyon atlandı.')));

    };

    options?.signal?.addEventListener('abort', onAbort, { once: true });



    es.addEventListener('progress', (ev) => {

      try {

        handlers.onProgress(JSON.parse((ev as MessageEvent).data) as SyncProgress);

      } catch {

        /* ignore malformed progress */

      }

    });



    es.addEventListener('done', () => {

      options?.signal?.removeEventListener('abort', onAbort);

      finish(resolve);

    });



    es.addEventListener('error', (ev) => {

      options?.signal?.removeEventListener('abort', onAbort);

      const data = (ev as MessageEvent).data;

      if (data) {

        try {

          const parsed = JSON.parse(data) as { message?: string };

          finish(() => reject(new Error(parsed.message ?? 'Senkronizasyon hatası.')));

        } catch {

          finish(() => reject(new Error('Senkronizasyon hatası.')));

        }

        return;

      }

      finish(() => reject(new Error('Sunucu bağlantısı kesildi.')));

    });

  });

}



/** FonBul-only daily incremental — waits for sync lock, then retries on transient errors. */

async function runBackgroundFonbulDaily(): Promise<void> {

  await waitForSyncIdle();

  const url = apiUrl('/sync/recent?range=daily&skipTefas=1');

  let lastError: Error | null = null;



  for (let attempt = 0; attempt < 8; attempt++) {

    if (attempt > 0) {

      await sleep(3000 * attempt);

      await waitForSyncIdle(60_000).catch(() => undefined);

    }

    try {

      await runSseSync(url, { onProgress: () => {} });

      return;

    } catch (err) {

      lastError = err instanceof Error ? err : new Error('FonBul arka plan senkronizasyonu başarısız.');

    }

  }



  throw lastError ?? new Error('FonBul arka plan senkronizasyonu başarısız.');

}



let backgroundFonbulInFlight = false;



function scheduleBackgroundFonbul(): void {

  if (backgroundFonbulInFlight) return;

  backgroundFonbulInFlight = true;



  void runBackgroundFonbulDaily()

    .then(() => {

      dispatchSyncFinished('auto-fonbul');

    })

    .catch((err) => {

      console.warn('[auto-sync] background FonBul failed:', err);

      toast.error('FonBul otomatik güncellemesi başarısız. Ayarlar → Veri Senkronizasyonu.', {

        duration: 5000,

      });

    })

    .finally(() => {

      backgroundFonbulInFlight = false;

    });

}



export interface AutoSyncState {

  isSyncing: boolean;

  progress: number;

  statusText: string;

  skipSync: () => void;

}



/**

 * Runs at most one TEFAS daily sync per 08:00 local reset window.

 * FonBul daily incremental always follows in the background (does not block startup).

 */

export function useAutoSync(): AutoSyncState {

  const [isSyncing, setIsSyncing] = useState(false);

  const [progress, setProgress] = useState(0);

  const [statusText, setStatusText] = useState('');

  const abortRef = useRef<AbortController | null>(null);



  const skipSync = useCallback(() => {

    abortRef.current?.abort();

    setIsSyncing(false);

    setStatusText('Senkronizasyon atlandı.');

  }, []);



  useEffect(() => {

    let cancelled = false;

    let completeTimer: ReturnType<typeof setTimeout> | null = null;

    let scheduleFonbul = false;



    const finishOverlay = (delayMs: number) => {

      completeTimer = setTimeout(() => {

        if (!cancelled) setIsSyncing(false);

      }, delayMs);

    };



    const run = async () => {

      if (isNativeApp() && !getApiBase()) return;



      const reset = shouldResetAutoSync();

      if (reset) {

        localStorage.removeItem(STORAGE_KEY);

      }



      const forced = shouldForceAutoSync() || reset;

      if (!forced && !shouldRunAutoSync()) return;



      scheduleFonbul = true;

      const abort = new AbortController();

      abortRef.current = abort;



      setIsSyncing(true);

      setProgress(0);

      setStatusText('TEFAS fiyatları güncelleniyor...');



      try {

        await runDailyTefasSync(

          {

            onProgress: (p) => {

              if (cancelled) return;

              setProgress(pctFromProgress(p));

              setStatusText(statusFromProgress(p));

            },

          },

          { maxMs: AUTO_SYNC_MAX_MS, signal: abort.signal }

        );



        if (cancelled) return;



        localStorage.setItem(STORAGE_KEY, new Date().toISOString());

        setProgress(100);

        setStatusText('Tamamlandı! FonBul arka planda güncelleniyor…');

        dispatchSyncFinished('auto-tefas');

        finishOverlay(1200);

      } catch (err) {

        if (cancelled || abort.signal.aborted) return;

        const message = err instanceof Error ? err.message : 'Senkronizasyon hatası.';

        setStatusText(message);

        toast.error('Güncel veri alınamadı, son bilinen fiyatlar gösteriliyor.');

        finishOverlay(1800);

      } finally {

        abortRef.current = null;

        if (scheduleFonbul && !cancelled) {

          scheduleBackgroundFonbul();

        }

      }

    };



    void run();



    return () => {

      cancelled = true;

      abortRef.current?.abort();

      if (completeTimer) clearTimeout(completeTimer);

    };

  }, []);



  return { isSyncing, progress, statusText, skipSync };

}


