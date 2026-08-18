export type SyncFinishedSource =
  | 'auto-tefas'
  | 'auto-fonbul'
  | 'fonbul-full'
  | 'recent-daily'
  | 'recent-weekly'
  | 'recent-monthly';

export interface SyncFinishedDetail {
  source: SyncFinishedSource;
  at: string;
}

const EVENT_NAME = 'fundtrack-sync-finished';
const LAST_SYNC_STORAGE_KEY = 'fundtrack_last_sync';

let syncRevision = 0;
let lastSync: SyncFinishedDetail | null = loadPersistedLastSync();
const revisionListeners = new Set<(detail: SyncFinishedDetail) => void>();

function loadPersistedLastSync(): SyncFinishedDetail | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncFinishedDetail;
    if (parsed?.source && parsed?.at) return parsed;
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function getSyncRevision(): number {
  return syncRevision;
}

export function getLastSync(): SyncFinishedDetail | null {
  return lastSync;
}

export function dispatchSyncFinished(source: SyncFinishedSource): void {
  const detail: SyncFinishedDetail = { source, at: new Date().toISOString() };
  lastSync = detail;
  syncRevision += 1;
  try {
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, JSON.stringify(detail));
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(
    new CustomEvent<SyncFinishedDetail>(EVENT_NAME, { detail })
  );
  for (const listener of revisionListeners) {
    listener(detail);
  }
}

export function subscribeSyncFinished(
  handler: (detail: SyncFinishedDetail) => void
): () => void {
  revisionListeners.add(handler);
  const domListener = (ev: Event) => {
    const custom = ev as CustomEvent<SyncFinishedDetail>;
    if (custom.detail) handler(custom.detail);
  };
  window.addEventListener(EVENT_NAME, domListener);
  return () => {
    revisionListeners.delete(handler);
    window.removeEventListener(EVENT_NAME, domListener);
  };
}

export function syncSourceLabel(source: SyncFinishedSource): string {
  switch (source) {
    case 'auto-tefas':
      return 'Otomatik (TEFAS)';
    case 'auto-fonbul':
      return 'Otomatik (FonBul)';
    case 'fonbul-full':
      return 'FonBul tam geçmiş';
    case 'recent-daily':
      return 'Günlük güncelleme';
    case 'recent-weekly':
      return 'Haftalık güncelleme';
    case 'recent-monthly':
      return 'Aylık güncelleme';
    default:
      return 'Senkronizasyon';
  }
}
