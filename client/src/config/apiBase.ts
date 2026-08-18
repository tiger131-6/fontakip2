import { Capacitor } from '@capacitor/core';



const STORAGE_KEY = 'fundtrack_api_base';



/** True when running inside Capacitor (Android/iOS), not browser/Electron. */

export function isNativeApp(): boolean {

  return Capacitor.isNativePlatform();

}



export function getApiBase(): string {

  const stored = localStorage.getItem(STORAGE_KEY)?.trim();

  if (stored) return stored.replace(/\/$/, '');

  const env = import.meta.env.VITE_API_BASE;

  if (typeof env === 'string' && env.trim()) return env.trim().replace(/\/$/, '');

  if (isNativeApp()) return 'http://127.0.0.1:38473';

  return '';

}



export function setApiBase(url: string): void {

  const trimmed = url.trim().replace(/\/$/, '');

  if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);

  else localStorage.removeItem(STORAGE_KEY);

}



/** Build full API URL. Path may be `/funds` or `/sync/recent?range=daily`. */

export function apiUrl(path: string): string {

  const normalized = path.startsWith('/api/')

    ? path

    : path.startsWith('/')

      ? `/api${path}`

      : `/api/${path}`;

  const base = getApiBase();

  if (!base) return normalized;

  return `${base}${normalized}`;

}



export async function checkApiHealth(): Promise<boolean> {

  try {

    const res = await fetch(apiUrl('/health'), { method: 'GET' });

    return res.ok;

  } catch {

    return false;

  }

}

