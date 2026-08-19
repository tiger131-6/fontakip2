/**
 * FVT "Günün Tahmini" — live fund estimate from the guess WebSocket.
 *
 * FVT's UI resolves: predictions[code].getiri (this socket) → gunlukGetiri → fund.getiri.
 * The value is broadcast on `data_update` after connecting to fws.fvt.com.tr.
 */

import { io, type Socket } from 'socket.io-client';

const FVT_API_BASE = 'https://fvt.com.tr/api/funds';
const GUESS_WS_URL = 'https://fws.fvt.com.tr';
const GUESS_WS_PATH = '/ws/guess/socket.io';

const PAGE_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  Referer: 'https://fvt.com.tr/fonlar/yatirim-fonlari/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const GUESS_TIMEOUT_MS = 15_000;

function roundTo3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw).trim().replace(/%/g, '').replace(/,/g, '.');
  if (!text || text === '-') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** FVT only shows "Günün Tahmini" when fund.hesaplama === 1. */
async function isFundEstimateEnabled(fundCode: string): Promise<boolean> {
  try {
    const response = await fetch(`${FVT_API_BASE}/${encodeURIComponent(fundCode)}`, {
      method: 'GET',
      headers: PAGE_HEADERS,
    });
    if (!response.ok) return true;

    const payload = (await response.json()) as {
      data?: { fund?: { hesaplama?: unknown } };
    };
    const hesaplama = Number(payload?.data?.fund?.hesaplama ?? 1);
    return hesaplama === 1;
  } catch {
    return true;
  }
}

function waitForGuessEstimate(fundCode: string): Promise<number | null> {
  const code = fundCode.trim().toUpperCase();
  const deviceId = `fundtrack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return new Promise((resolve) => {
    let settled = false;
    let socket: Socket | null = null;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.removeAllListeners();
        socket?.close();
      } catch {
        // ignore
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), GUESS_TIMEOUT_MS);

    socket = io(GUESS_WS_URL, {
      path: GUESS_WS_PATH,
      transports: ['polling', 'websocket'],
      query: { deviceId },
      timeout: 10_000,
      reconnection: false,
    });

    socket.on('connect_error', () => finish(null));

    socket.on('data_update', (payload: unknown) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const record = row as { symbol?: unknown; getiri?: unknown };
        const symbol =
          typeof record.symbol === 'string' ? record.symbol.trim().toUpperCase() : '';
        if (symbol !== code) continue;

        const getiri = parseNumber(record.getiri);
        if (getiri != null) {
          finish(roundTo3(getiri));
          return;
        }
      }
    });
  });
}

/** Fetch FVT's "Günün Tahmini" percentage for a fund code. */
export async function fetchFvtDailyEstimate(fundCode: string): Promise<number | null> {
  const code = fundCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(code)) return null;

  const enabled = await isFundEstimateEnabled(code);
  if (!enabled) return null;

  return waitForGuessEstimate(code);
}
