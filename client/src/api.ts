import type {
  Fund,
  HistoryResponse,
  RefreshResponse,
  BackfillResponse,
  FundListDiff,
  ApplyResult,
  PortfolioHistoryEntry,
  PortfolioResponse,
  AddPortfolioInput,
  FundOverviewResponse,
  GoldPriceQuote,
  BackupPayload,
  BackupImportResult,
  FonbulStats,
  FonbulMetricsResponse,
  FonbulHeatmapResponse,
  TechnicalScreenerResponse,
  DividendEntry,
  PriceAlert,
  FundCagrResult,
} from './types';
import { apiUrl } from './config/apiBase';

async function asJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const snippet = (await res.text()).slice(0, 80).toLowerCase();
    if (snippet.includes('<!doctype') || snippet.includes('<html')) {
      throw new Error(
        'Sunucu JSON yerine HTML döndürdü. Ayarlarda API adresinin doğru olduğundan emin olun — port 3001 olmalı (5173 değil). Örnek: http://192.168.1.4:3001'
      );
    }
    throw new Error(`Beklenmeyen yanıt türü (${res.status}). Sunucu adresini kontrol edin.`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error ? `: ${body.error}` : '';
    } catch {
      /* ignore parse errors */
    }
    throw new Error(`İstek başarısız (${res.status})${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function getFunds(): Promise<Fund[]> {
  return asJson<Fund[]>(await fetch(apiUrl('/funds')));
}

const OVERVIEW_CLIENT_TTL_MS = 10 * 60 * 1000;
let overviewClientCache: { data: FundOverviewResponse; at: number } | null = null;

export function peekFundOverviewCache(): FundOverviewResponse | null {
  if (
    overviewClientCache &&
    Date.now() - overviewClientCache.at < OVERVIEW_CLIENT_TTL_MS
  ) {
    return overviewClientCache.data;
  }
  return null;
}

/** Keep cached overview rows in sync after a watchlist toggle. */
export function patchFundOverviewFavorite(code: string, isFavorite: boolean): void {
  if (!overviewClientCache) return;
  const upper = code.trim().toUpperCase();
  overviewClientCache = {
    at: overviewClientCache.at,
    data: {
      ...overviewClientCache.data,
      rows: overviewClientCache.data.rows.map((r) =>
        r.fund_code === upper ? { ...r, is_favorite: isFavorite } : r
      ),
    },
  };
}

/** Overlay live watchlist flags from /api/funds onto overview rows. */
async function mergeOverviewFavorites(data: FundOverviewResponse): Promise<FundOverviewResponse> {
  const funds = await getFunds();
  const favorites = new Set(funds.filter((f) => f.is_favorite).map((f) => f.fund_code));
  const rows = data.rows.map((r) => ({
    ...r,
    is_favorite: favorites.has(r.fund_code),
  }));
  return { ...data, rows };
}

export async function getFundOverview(refresh = false): Promise<FundOverviewResponse> {
  if (!refresh) {
    const cached = peekFundOverviewCache();
    if (cached) {
      const merged = await mergeOverviewFavorites(cached);
      overviewClientCache = { data: merged, at: overviewClientCache!.at };
      return merged;
    }
  }

  const q = refresh ? '?refresh=1' : '';
  const data = await asJson<FundOverviewResponse>(await fetch(apiUrl(`/funds/overview${q}`)));
  overviewClientCache = { data, at: Date.now() };
  return data;
}

export async function addToWatchlist(code: string): Promise<{ fund_code: string; is_favorite: boolean }> {
  return asJson(
    await fetch(apiUrl(`/watchlist/${encodeURIComponent(code)}`), { method: 'POST' })
  );
}

export async function removeFromWatchlist(
  code: string
): Promise<{ fund_code: string; is_favorite: boolean }> {
  return asJson(
    await fetch(apiUrl(`/watchlist/${encodeURIComponent(code)}`), { method: 'DELETE' })
  );
}

export async function getHistory(code: string): Promise<HistoryResponse> {
  return asJson<HistoryResponse>(await fetch(apiUrl(`/funds/${encodeURIComponent(code)}/history`)));
}

export async function refreshFund(code: string): Promise<RefreshResponse> {
  return asJson<RefreshResponse>(
    await fetch(apiUrl(`/funds/${encodeURIComponent(code)}/refresh`), { method: 'POST' })
  );
}

export async function backfillFund(code: string, days = 365): Promise<BackfillResponse> {
  return asJson<BackfillResponse>(
    await fetch(apiUrl(`/funds/${encodeURIComponent(code)}/backfill?days=${days}`), {
      method: 'POST',
    })
  );
}

export async function checkFundList(): Promise<FundListDiff> {
  return asJson<FundListDiff>(await fetch(apiUrl('/funds/check')));
}

export async function applyFundList(): Promise<ApplyResult> {
  return asJson<ApplyResult>(await fetch(apiUrl('/funds/apply'), { method: 'POST' }));
}

export async function getPortfolio(): Promise<PortfolioResponse> {
  return asJson<PortfolioResponse>(await fetch(apiUrl('/portfolio')));
}

export async function getPortfolioHistory(): Promise<PortfolioHistoryEntry[]> {
  return asJson<PortfolioHistoryEntry[]>(await fetch(apiUrl('/portfolio/history')));
}

export async function clearPortfolioHistory(): Promise<{ deleted: number }> {
  return asJson<{ deleted: number }>(
    await fetch(apiUrl('/portfolio/history'), { method: 'DELETE' })
  );
}

export async function deletePortfolioHistoryEntry(id: number): Promise<PortfolioHistoryEntry[]> {
  return asJson<PortfolioHistoryEntry[]>(
    await fetch(apiUrl(`/portfolio/history/${id}`), { method: 'DELETE' })
  );
}

export async function getGoldPrice(refresh = false): Promise<GoldPriceQuote> {
  const q = refresh ? '?refresh=1' : '';
  return asJson<GoldPriceQuote>(await fetch(apiUrl(`/gold/price${q}`)));
}

export async function exportBackup(): Promise<void> {
  const res = await fetch(apiUrl('/backup/export'));
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error ? `: ${body.error}` : '';
    } catch {
      /* ignore */
    }
    throw new Error(`Yedek indirilemedi (${res.status})${detail}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'fundtrack_backup.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function importBackup(payload: BackupPayload): Promise<BackupImportResult> {
  const res = await fetch(apiUrl('/backup/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return asJson<BackupImportResult>(res);
}

export async function addPortfolioEntry(input: AddPortfolioInput): Promise<PortfolioResponse> {
  const res = await fetch(apiUrl('/portfolio'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await asJson<{ portfolio: PortfolioResponse }>(res);
  return body.portfolio;
}

export async function deletePortfolioEntry(id: number): Promise<PortfolioResponse> {
  return asJson<PortfolioResponse>(
    await fetch(apiUrl(`/portfolio/${id}`), { method: 'DELETE' })
  );
}

export async function getFonbulStats(): Promise<FonbulStats> {
  return asJson<FonbulStats>(await fetch(apiUrl('/fonbul/stats')));
}

export interface FonbulMetricsQuery {
  page?: number;
  pageSize?: number;
  start?: string;
  end?: string;
}

export async function getFonbulMetrics(
  code: string,
  query: FonbulMetricsQuery = {}
): Promise<FonbulMetricsResponse> {
  const q = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 25),
  });
  if (query.start) q.set('start', query.start);
  if (query.end) q.set('end', query.end);
  return asJson<FonbulMetricsResponse>(
    await fetch(apiUrl(`/fonbul/metrics/${encodeURIComponent(code)}?${q}`))
  );
}

export async function getFonbulHeatmap(start: string, end: string): Promise<FonbulHeatmapResponse> {
  const q = new URLSearchParams({ start, end });
  return asJson<FonbulHeatmapResponse>(await fetch(apiUrl(`/fonbul/heatmap?${q}`)));
}

export async function getTechnicalScreener(days = 90): Promise<TechnicalScreenerResponse> {
  const q = new URLSearchParams({ days: String(days) });
  return asJson<TechnicalScreenerResponse>(await fetch(apiUrl(`/fonbul/screener?${q}`)));
}

export async function getDividends(): Promise<DividendEntry[]> {
  return asJson<DividendEntry[]>(await fetch(apiUrl('/dividends')));
}

export async function addDividend(input: {
  fund_code: string;
  amount_tl: number;
  date: string;
}): Promise<DividendEntry> {
  const res = await fetch(apiUrl('/dividends'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return asJson<DividendEntry>(res);
}

export async function deleteDividend(id: number): Promise<void> {
  await asJson(await fetch(apiUrl(`/dividends/${id}`), { method: 'DELETE' }));
}

export async function getAlerts(): Promise<PriceAlert[]> {
  return asJson<PriceAlert[]>(await fetch(apiUrl('/alerts')));
}

export async function createAlert(input: {
  fund_code: string;
  target_price: number;
  condition: 'ABOVE' | 'BELOW';
}): Promise<PriceAlert> {
  const res = await fetch(apiUrl('/alerts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return asJson<PriceAlert>(res);
}

export async function updateAlert(
  id: number,
  input: {
    fund_code: string;
    target_price: number;
    condition: 'ABOVE' | 'BELOW';
    is_active?: boolean;
  }
): Promise<PriceAlert> {
  const res = await fetch(apiUrl(`/alerts/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return asJson<PriceAlert>(res);
}

export async function deleteAlert(id: number): Promise<void> {
  await asJson(await fetch(apiUrl(`/alerts/${id}`), { method: 'DELETE' }));
}

export async function exportPortfolioExcel(): Promise<void> {
  const res = await fetch(apiUrl('/export/excel'));
  if (!res.ok) throw new Error(`Excel indirilemedi (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'fundtrack_export.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function getFundCagr(code: string): Promise<FundCagrResult> {
  return asJson<FundCagrResult>(
    await fetch(apiUrl(`/funds/${encodeURIComponent(code)}/cagr`))
  );
}
