import { checkApiHealth, getApiBase, isNativeApp, setApiBase } from './apiBase';

/** Same port as the Windows desktop Electron app. */
export const LOCAL_API_PORT = 38473;
export const LOCAL_API_BASE = `http://127.0.0.1:${LOCAL_API_PORT}`;

export function getDefaultNativeApiBase(): string {
  return LOCAL_API_BASE;
}

/** Wait until the embedded on-device API responds (Android standalone mode). */
export async function ensureLocalServer(maxAttempts = 90): Promise<void> {
  if (!isNativeApp()) return;

  const stored = getApiBase();
  if (stored && stored !== LOCAL_API_BASE) {
    const ok = await checkApiHealth();
    if (ok) return;
  }

  setApiBase(LOCAL_API_BASE);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await checkApiHealth()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    'Yerel veritabanı sunucusu başlatılamadı. Uygulamayı kapatıp yeniden açın.'
  );
}
