import { apiUrl } from '../config/apiBase';

export interface FvtPortfolioHolding {
  ticker: string;
  weight: number;
  /** null when FVT did not supply Getiri % — caller may fallback. */
  dailyChange: number | null;
  source: string;
}

export interface FvtPortfolioResult {
  holdings: FvtPortfolioHolding[];
  /** FVT "Günün Tahmini" from guess WebSocket; null when unavailable. */
  dailyEstimate: number | null;
}

interface FvtPortfolioResponse {
  fundCode: string;
  holdings: FvtPortfolioHolding[];
  dailyEstimate?: number | null;
  fetchedAt: string;
  disclosureDate?: string;
}

/**
 * Fetch a fund's portfolio distribution from FVT (weights + Getiri % when available)
 * and FVT's own "Günün Tahmini" estimate.
 * Uses the bundled Express proxy to avoid browser CORS limits on fvt.com.tr.
 */
export async function fetchFvtPortfolio(fundCode: string): Promise<FvtPortfolioResult> {
  const code = fundCode.trim().toUpperCase();
  if (!code) throw new Error('Geçerli bir fon kodu girin.');

  const response = await fetch(
    apiUrl(`/market/fvt-portfolio/${encodeURIComponent(code)}?_=${Date.now()}`),
    {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    }
  );

  if (!response.ok) {
    let message = `FVT isteği başarısız: HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { error?: string };
      if (err.error) message = err.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const data = (await response.json()) as FvtPortfolioResponse;
  if (!Array.isArray(data.holdings) || data.holdings.length === 0) {
    throw new Error(`${code} için portföy dağılımı bulunamadı.`);
  }

  const dailyEstimate =
    typeof data.dailyEstimate === 'number' && Number.isFinite(data.dailyEstimate)
      ? data.dailyEstimate
      : null;

  return {
    holdings: data.holdings,
    dailyEstimate,
  };
}
