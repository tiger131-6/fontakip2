import { apiUrl, checkApiHealth, getApiBase } from '../config/apiBase';

export interface SyncLockStatus {
  syncActive: boolean;
  fonbulSyncActive: boolean;
}

export async function fetchSyncLockStatus(): Promise<SyncLockStatus | null> {
  try {
    const res = await fetch(apiUrl('/sync/status'));
    if (!res.ok) return null;
    return (await res.json()) as SyncLockStatus;
  } catch {
    return null;
  }
}

function localApiUnreachableMessage(): string {
  const base = getApiBase();
  if (base.includes(':5173')) {
    return (
      'API adresi yanlış görünüyor (port 5173 = arayüz). Ayarlar’daki adresi boş bırakın veya ' +
      'http://127.0.0.1:38473 (FundTrack Local) / http://localhost:3001 (geliştirme) kullanın.'
    );
  }
  if (base) {
    return `Yerel veritabanı servisine ulaşılamadı (${base}). Uygulamayı yeniden başlatın veya Ayarlar’daki API adresini kontrol edin.`;
  }
  return (
    'Yerel veritabanı servisine ulaşılamadı. FundTrack Local kullanıyorsanız uygulamayı yeniden başlatın. ' +
    'Geliştirme modunda iseniz API sunucusunun çalıştığından emin olun (port 3001).'
  );
}

/** Ensure the embedded/local API is up and no conflicting SSE job is running. */
export async function assertSyncStreamReady(opts?: {
  requireTefasSlot?: boolean;
  requireFonbulSlot?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const healthy = await checkApiHealth();
  if (!healthy) {
    return { ok: false, message: localApiUnreachableMessage() };
  }

  const status = await fetchSyncLockStatus();
  if (!status) {
    return { ok: false, message: localApiUnreachableMessage() };
  }

  if (opts?.requireTefasSlot !== false && status.syncActive) {
    return {
      ok: false,
      message:
        'Başka bir fiyat güncellemesi zaten çalışıyor (otomatik senkron veya tam geçmiş). ' +
        'Birkaç dakika bekleyip tekrar deneyin.',
    };
  }

  if (opts?.requireFonbulSlot && status.fonbulSyncActive) {
    return {
      ok: false,
      message: 'FonBul senkronizasyonu zaten çalışıyor. Bitmesini bekleyip tekrar deneyin.',
    };
  }

  return { ok: true };
}

export interface SyncEventSourceHandlers<TDone = unknown> {
  onProgress?: (data: unknown) => void;
  onDone?: (data: TDone) => void;
  onError?: (message: string) => void;
}

/** Open an SSE sync stream with a finished guard so close-after-done is not reported as disconnect. */
export function connectSyncEventSource<TDone = unknown>(
  path: string,
  handlers: SyncEventSourceHandlers<TDone>
): { close: () => void } {
  const es = new EventSource(apiUrl(path));
  let finished = false;

  const finish = () => {
    finished = true;
    es.close();
  };

  es.addEventListener('progress', (ev) => {
    try {
      handlers.onProgress?.(JSON.parse((ev as MessageEvent).data));
    } catch {
      /* ignore malformed frame */
    }
  });

  es.addEventListener('done', (ev) => {
    let parsed: TDone | undefined;
    try {
      parsed = JSON.parse((ev as MessageEvent).data) as TDone;
    } catch {
      /* ignore */
    }
    finish();
    if (parsed !== undefined) handlers.onDone?.(parsed);
    else handlers.onDone?.(undefined as TDone);
  });

  es.addEventListener('error', (ev) => {
    const data = (ev as MessageEvent).data;
    if (data) {
      let message = 'Güncelleme hatası.';
      try {
        message = (JSON.parse(data) as { message?: string }).message ?? message;
      } catch {
        /* ignore */
      }
      finish();
      handlers.onError?.(message);
      return;
    }
    if (!finished) {
      finish();
      handlers.onError?.(localApiUnreachableMessage());
    }
  });

  return {
    close: () => {
      if (!finished) finish();
    },
  };
}
