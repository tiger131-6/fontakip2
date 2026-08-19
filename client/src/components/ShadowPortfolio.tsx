import { useEffect, useMemo, useRef, useState } from 'react';
import ViewHeader from './ViewHeader';
import { apiUrl } from '../config/apiBase';
import { fetchFvtPortfolio } from '../utils/fvtPortfolio';
import { fetchStockDailyChange, dailyChangeSourceLabel } from '../utils/stockDailyChange';

interface ShadowStock {
  ticker: string;
  weight: number;
  dailyChange: number;
  dailyChangeSource: string | null;
}

interface ShadowPortfolioItem {
  fundCode: string;
  stocks: ShadowStock[];
  /** FVT "Günün Tahmini" from guess WebSocket; null when unavailable. */
  fvtDailyEstimate?: number | null;
}

const STORAGE_KEY = 'shadow_portfolios';
const ERROR_AUTO_DISMISS_MS = 20000;

interface MarketQuote {
  price: string;
  change: number;
}

interface MarketSummaryData {
  bist: MarketQuote | null;
  usd: MarketQuote | null;
  eur: MarketQuote | null;
  gold: MarketQuote | null;
}

const EMPTY_MARKET_DATA: MarketSummaryData = {
  bist: null,
  usd: null,
  eur: null,
  gold: null,
};

const MARKET_SUMMARY_SYMBOLS = [
  { key: 'bist', label: 'BIST 100' },
  { key: 'usd', label: 'USD/TRY' },
  { key: 'eur', label: 'EUR/TRY' },
  { key: 'gold', label: 'GRAM ALTIN' },
] as const;

function formatMarketPrice(key: keyof MarketSummaryData, price: string): string {
  const num = Number(price);
  if (!Number.isFinite(num)) return price;
  const formatted = num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return key === 'gold' ? `${formatted} ₺/gr` : formatted;
}

function changePctClass(change: number): string {
  if (change > 0) return 'text-emerald-700';
  if (change < 0) return 'text-rose-700';
  return 'text-slate-500';
}

function formatChangePct(change: number): string {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sanitizeStock(raw: unknown): ShadowStock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    ticker?: unknown;
    weight?: unknown;
    dailyChange?: unknown;
    dailyChangeSource?: unknown;
  };
  const ticker = typeof r.ticker === 'string' ? r.ticker.trim().toUpperCase() : '';
  if (!ticker) return null;

  const weight = Number(r.weight);
  const dailyChange = Number(r.dailyChange);
  const dailyChangeSource =
    typeof r.dailyChangeSource === 'string' ? r.dailyChangeSource : null;
  return {
    ticker,
    weight: Number.isFinite(weight) ? weight : 0,
    dailyChange: Number.isFinite(dailyChange) ? dailyChange : 0,
    dailyChangeSource,
  };
}

function readStoredPortfolios(): ShadowPortfolioItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seenFunds = new Set<string>();
    const result: ShadowPortfolioItem[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const record = item as {
        fundCode?: unknown;
        stocks?: unknown;
        fvtDailyEstimate?: unknown;
      };
      const fundCode =
        typeof record.fundCode === 'string' ? record.fundCode.trim().toUpperCase() : '';
      if (!fundCode || seenFunds.has(fundCode)) continue;
      seenFunds.add(fundCode);

      const stocksRaw = Array.isArray(record.stocks) ? record.stocks : [];
      const seenTickers = new Set<string>();
      const stocks: ShadowStock[] = [];
      for (const s of stocksRaw) {
        const stock = sanitizeStock(s);
        if (!stock || seenTickers.has(stock.ticker)) continue;
        seenTickers.add(stock.ticker);
        stocks.push(stock);
      }

      const fvtDailyEstimate =
        typeof record.fvtDailyEstimate === 'number' && Number.isFinite(record.fvtDailyEstimate)
          ? record.fvtDailyEstimate
          : null;

      result.push({ fundCode, stocks, fvtDailyEstimate });
    }

    return result;
  } catch {
    return [];
  }
}

/** Weighted sum of daily changes. When `normalize`, scale tracked weights up to 100%. */
function estimateReturn(stocks: ShadowStock[], normalize: boolean): number {
  if (stocks.length === 0) return 0;
  const weightedSum = stocks.reduce((acc, s) => acc + (s.weight / 100) * s.dailyChange, 0);
  if (!normalize) return weightedSum;

  const total = stocks.reduce((acc, s) => acc + s.weight, 0);
  if (total <= 0) return 0;
  return weightedSum * (100 / total);
}

function totalWeight(stocks: ShadowStock[]): number {
  return stocks.reduce((acc, s) => acc + s.weight, 0);
}

function formatPct(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedPct(n: number): string {
  return `${n > 0 ? '+' : ''}${formatPct(n)}%`;
}

function signedFvtPct(n: number): string {
  const formatted = n.toLocaleString('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `${n > 0 ? '+' : ''}${formatted}%`;
}

function returnColor(n: number): string {
  if (n > 0) return 'text-emerald-600';
  if (n < 0) return 'text-red-600';
  return 'text-slate-500';
}

/** Empty string for 0 keeps the dense grid readable; user types over it. */
function numToText(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  return String(n);
}

function parseInput(raw: string): number {
  if (raw.trim() === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

interface StockRowProps {
  stock: ShadowStock;
  normalize: boolean;
  trackedWeight: number;
  fetchToken: number;
  onChange: (field: 'weight' | 'dailyChange', value: number) => void;
  onRemove: () => void;
}

/**
 * Local text state lets the user type partial values ("-", "1.", "-2.3")
 * without the number snapping that controlled numeric inputs cause.
 */
function StockRow({ stock, normalize, trackedWeight, fetchToken, onChange, onRemove }: StockRowProps) {
  const [weightText, setWeightText] = useState(() => numToText(stock.weight));
  const [changeText, setChangeText] = useState(() => numToText(stock.dailyChange));

  // Re-sync local inputs whenever this fund's stocks are refreshed externally (FVT import).
  useEffect(() => {
    setWeightText(numToText(stock.weight));
    setChangeText(numToText(stock.dailyChange));
  }, [fetchToken]);

  const handleWeight = (raw: string) => {
    setWeightText(raw);
    onChange('weight', parseInput(raw));
  };

  const handleChange = (raw: string) => {
    setChangeText(raw);
    onChange('dailyChange', parseInput(raw));
  };

  const scale = normalize && trackedWeight > 0 ? 100 / trackedWeight : 1;
  const contribution = (stock.weight / 100) * stock.dailyChange * scale;

  return (
    <tr className="border-t border-slate-100">
      <td className="px-2 py-1.5">
        <span className="font-mono text-xs font-bold text-slate-800">{stock.ticker}</span>
      </td>
      <td className="px-1 py-1.5">
        <input
          type="number"
          step="any"
          value={weightText}
          onChange={(e) => handleWeight(e.target.value)}
          placeholder="0"
          aria-label={`${stock.ticker} ağırlık`}
          className="w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-right font-mono text-xs tabular-nums focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </td>
      <td className="px-1 py-1.5">
        <div className="flex flex-col items-end gap-0.5">
          <input
            type="number"
            step="any"
            value={changeText}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="0"
            aria-label={`${stock.ticker} günlük değişim`}
            className={`w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-right font-mono text-xs font-semibold tabular-nums focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 ${returnColor(
              stock.dailyChange
            )}`}
          />
          {stock.dailyChangeSource && (
            <span
              className="font-mono text-[9px] font-medium uppercase tracking-wide text-slate-400"
              title="Veri kaynağı"
            >
              {dailyChangeSourceLabel(stock.dailyChangeSource)}
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className={`font-mono text-xs tabular-nums ${returnColor(contribution)}`}>
          {signedPct(contribution)}
        </span>
      </td>
      <td className="px-1 py-1.5 text-right">
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          aria-label={`${stock.ticker} kaldır`}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

interface FundCardProps {
  item: ShadowPortfolioItem;
  normalize: boolean;
  isLoading: boolean;
  fetchToken: number;
  fetchError: string | null;
  lastError: string | null;
  onClearLastError: () => void;
  onRefreshPortfolio: (fundCode: string) => void;
  onAddStock: (fundCode: string, stock: ShadowStock) => void;
  onUpdateStock: (
    fundCode: string,
    ticker: string,
    field: 'weight' | 'dailyChange',
    value: number
  ) => void;
  onRemoveStock: (fundCode: string, ticker: string) => void;
  onRemoveFund: (fundCode: string) => void;
}

function FundCard({
  item,
  normalize,
  isLoading,
  fetchToken,
  fetchError,
  lastError,
  onClearLastError,
  onRefreshPortfolio,
  onAddStock,
  onUpdateStock,
  onRemoveStock,
  onRemoveFund,
}: FundCardProps) {
  const [ticker, setTicker] = useState('');
  const [weight, setWeight] = useState('');
  const [dailyChange, setDailyChange] = useState('');

  const estimate = estimateReturn(item.stocks, normalize);
  const tracked = totalWeight(item.stocks);

  const handleAddStock = () => {
    const cleaned = ticker.trim().toUpperCase();
    if (!cleaned) return;
    onAddStock(item.fundCode, {
      ticker: cleaned,
      weight: parseInput(weight),
      dailyChange: parseInput(dailyChange),
      dailyChangeSource: null,
    });
    setTicker('');
    setWeight('');
    setDailyChange('');
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-mono text-lg font-bold text-indigo-900">{item.fundCode}</div>
            <button
              type="button"
              onClick={() => onRefreshPortfolio(item.fundCode)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="FVT portföy dağılımını tek istekle getir (ağırlık + günlük %)"
            >
              <svg
                className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 00-.11-1.499H4.414a.75.75 0 00-.75.75v3.957a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.388zm-9.624-2.848a5.5 5.5 0 019.201-2.466l.312.311H12.77a.75.75 0 00.11 1.499h3.918a.75.75 0 00.75-.75V4.462a.75.75 0 00-1.5 0v2.43l-.31-.31a7 7 0 00-11.712 3.138.75.75 0 001.449.388z"
                  clipRule="evenodd"
                />
              </svg>
              {isLoading ? 'Getiriliyor…' : 'FVT\'den Getir'}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-start gap-6 sm:gap-8">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Tahmini Fon Getirisi (Bizim)
              </span>
              <div className={`mt-0.5 text-3xl font-extrabold tabular-nums ${returnColor(estimate)}`}>
                {signedPct(estimate)}
              </div>
            </div>

            {item.fvtDailyEstimate != null && (
              <div className="border-l border-slate-200 pl-6 sm:pl-8">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Tahmini Fon Getirisi (FVT)
                  <svg
                    className="h-3 w-3 text-slate-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                  </svg>
                </span>
                <div
                  className={`mt-0.5 text-2xl font-bold tabular-nums ${
                    item.fvtDailyEstimate >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}
                >
                  {signedFvtPct(item.fvtDailyEstimate)}
                </div>
              </div>
            )}
          </div>
          {lastError && (
            <div className="mt-2 rounded border border-red-400 bg-red-100 px-3 py-2 text-[10px] text-red-700">
              <strong>Hata Detayı:</strong> {lastError}
              <button
                type="button"
                onClick={onClearLastError}
                className="ml-2 font-bold underline hover:text-red-900"
              >
                Kapat
              </button>
            </div>
          )}
          {fetchError && !lastError && (
            <p className="mt-1 text-[10px] font-medium text-amber-700">{fetchError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemoveFund(item.fundCode)}
          className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          aria-label={`${item.fundCode} günlük tahmin kaydını kaldır`}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M6 2a1 1 0 00-1 1v1H3.5a.5.5 0 000 1H4v11a2 2 0 002 2h8a2 2 0 002-2V5h.5a.5.5 0 000-1H15V3a1 1 0 00-1-1H6zm2 5a.5.5 0 011 0v8a.5.5 0 01-1 0V7zm4 0a.5.5 0 011 0v8a.5.5 0 01-1 0V7z" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-2 text-[10px] font-medium text-slate-500">
        <span>
          İzlenen ağırlık:{' '}
          <span className={tracked > 100 ? 'font-bold text-amber-600' : 'font-bold text-slate-700'}>
            %{formatPct(tracked)}
          </span>
        </span>
        <span className="text-slate-400">{item.stocks.length} hisse</span>
      </div>

      <div className="px-2">
        {item.stocks.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-slate-400">
            Henüz hisse eklenmedi. &quot;FVT&apos;den Getir&quot; ile portföy dağılımını
            otomatik getirin veya aşağıdan manuel ekleyin.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-2 py-1 text-left">Hisse</th>
                <th className="px-1 py-1 text-right">Ağırlık %</th>
                <th className="px-1 py-1 text-right">Günlük %</th>
                <th className="px-2 py-1 text-right">Katkı</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {item.stocks.map((stock) => (
                <StockRow
                  key={stock.ticker}
                  stock={stock}
                  normalize={normalize}
                  trackedWeight={tracked}
                  fetchToken={fetchToken}
                  onChange={(field, value) =>
                    onUpdateStock(item.fundCode, stock.ticker, field, value)
                  }
                  onRemove={() => onRemoveStock(item.fundCode, stock.ticker)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-auto border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-1.5">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddStock();
            }}
            placeholder="HİSSE"
            aria-label="Yeni hisse kodu"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 font-mono text-xs font-bold uppercase focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="number"
            step="any"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddStock();
            }}
            placeholder="Ağırlık"
            aria-label="Yeni hisse ağırlığı"
            className="w-20 rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="number"
            step="any"
            value={dailyChange}
            onChange={(e) => setDailyChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddStock();
            }}
            placeholder="Günlük %"
            aria-label="Yeni hisse günlük değişimi"
            className="w-20 rounded border border-slate-300 px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleAddStock}
            disabled={!ticker.trim()}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Hisse Ekle
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShadowPortfolio() {
  const [portfolios, setPortfolios] = useState<ShadowPortfolioItem[]>(readStoredPortfolios);
  const [newFundCode, setNewFundCode] = useState('');
  const [normalize, setNormalize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingFunds, setLoadingFunds] = useState<Set<string>>(() => new Set());
  const [fetchTokens, setFetchTokens] = useState<Record<string, number>>({});
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  const [lastErrors, setLastErrors] = useState<Record<string, string>>({});
  const [marketData, setMarketData] = useState<MarketSummaryData>(EMPTY_MARKET_DATA);
  const errorDismissTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const setFundLastError = (fundCode: string, message: string) => {
    setLastErrors((prev) => ({ ...prev, [fundCode]: message }));

    const existing = errorDismissTimers.current.get(fundCode);
    if (existing) clearTimeout(existing);

    errorDismissTimers.current.set(
      fundCode,
      setTimeout(() => {
        setLastErrors((prev) => {
          if (prev[fundCode] !== message) return prev;
          const next = { ...prev };
          delete next[fundCode];
          return next;
        });
        errorDismissTimers.current.delete(fundCode);
      }, ERROR_AUTO_DISMISS_MS)
    );
  };

  const clearFundLastError = (fundCode: string) => {
    const existing = errorDismissTimers.current.get(fundCode);
    if (existing) clearTimeout(existing);
    errorDismissTimers.current.delete(fundCode);
    setLastErrors((prev) => {
      if (!prev[fundCode]) return prev;
      const next = { ...prev };
      delete next[fundCode];
      return next;
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
    } catch {
      // Ignore quota / private-mode errors.
    }
  }, [portfolios]);

  useEffect(() => {
    const fetchMarketSummary = async () => {
      try {
        const res = await fetch(apiUrl(`/market/summary?_=${Date.now()}`), {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          console.error('[MarketSummary] HTTP', res.status);
          return;
        }

        const data = (await res.json()) as MarketSummaryData;
        setMarketData({
          bist: data.bist ?? null,
          usd: data.usd ?? null,
          eur: data.eur ?? null,
          gold: data.gold ?? null,
        });
      } catch (e) {
        console.error('[MarketSummary] fetch failed:', e);
      }
    };

    void fetchMarketSummary();
  }, []);

  const fundCount = portfolios.length;
  const trackedStocks = useMemo(
    () => portfolios.reduce((acc, p) => acc + p.stocks.length, 0),
    [portfolios]
  );

  const addPortfolio = () => {
    const code = newFundCode.trim().toUpperCase();
    if (!code) return;
    if (portfolios.some((p) => p.fundCode === code)) {
      setError(`${code} zaten günlük tahmin listesinde mevcut.`);
      return;
    }
    setPortfolios((prev) => [...prev, { fundCode: code, stocks: [], fvtDailyEstimate: null }]);
    setNewFundCode('');
    setError(null);
    void handleFetchFvtPortfolio(code);
  };

  const removePortfolio = (fundCode: string) => {
    setPortfolios((prev) => prev.filter((p) => p.fundCode !== fundCode));
  };

  const addStock = (fundCode: string, stock: ShadowStock) => {
    setPortfolios((prev) =>
      prev.map((p) => {
        if (p.fundCode !== fundCode) return p;
        if (p.stocks.some((s) => s.ticker === stock.ticker)) return p;
        return { ...p, stocks: [...p.stocks, stock] };
      })
    );
  };

  const updateStock = (
    fundCode: string,
    ticker: string,
    field: 'weight' | 'dailyChange',
    value: number
  ) => {
    setPortfolios((prev) =>
      prev.map((p) =>
        p.fundCode === fundCode
          ? {
              ...p,
              stocks: p.stocks.map((s) => (s.ticker === ticker ? { ...s, [field]: value } : s)),
            }
          : p
      )
    );
  };

  const removeStock = (fundCode: string, ticker: string) => {
    setPortfolios((prev) =>
      prev.map((p) =>
        p.fundCode === fundCode
          ? { ...p, stocks: p.stocks.filter((s) => s.ticker !== ticker) }
          : p
      )
    );
  };

  /** Fetch FVT portfolio; fallback to İş Yatırım/TEFAS only when Getiri % is missing. */
  const handleFetchFvtPortfolio = async (fundCode: string) => {
    setLoadingFunds((prev) => new Set(prev).add(fundCode));
    setFetchErrors((prev) => {
      const next = { ...prev };
      delete next[fundCode];
      return next;
    });
    clearFundLastError(fundCode);

    try {
      const fvtData = await fetchFvtPortfolio(fundCode);

      const enriched = await Promise.all(
        fvtData.holdings.map(async (item) => {
          if (item.dailyChange != null) {
            return item;
          }

          try {
            const dailyChangeResult = await fetchStockDailyChange(item.ticker);
            const value = Number(dailyChangeResult.value);
            return {
              ...item,
              dailyChange: Number.isFinite(value) ? value : 0,
              source: dailyChangeResult.source || 'Bilinmiyor',
            };
          } catch {
            return { ...item, dailyChange: 0, source: 'FAILED' };
          }
        })
      );

      setPortfolios((prev) =>
        prev.map((p) => {
          if (p.fundCode !== fundCode) return p;
          const stocks: ShadowStock[] = enriched.map((h) => ({
            ticker: h.ticker,
            weight: h.weight,
            dailyChange: h.dailyChange ?? 0,
            dailyChangeSource: h.source,
          }));
          return { ...p, stocks, fvtDailyEstimate: fvtData.dailyEstimate };
        })
      );

      setFetchTokens((prev) => ({ ...prev, [fundCode]: (prev[fundCode] ?? 0) + 1 }));
      clearFundLastError(fundCode);
    } catch (e) {
      const message = formatErrorMessage(e);
      setFundLastError(fundCode, message);
      setFetchErrors((prev) => ({ ...prev, [fundCode]: message }));
    } finally {
      setLoadingFunds((prev) => {
        const next = new Set(prev);
        next.delete(fundCode);
        return next;
      });
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <ViewHeader
        title="Günlük Tahmin"
        subtitle="Fonların açıklanan en büyük hisse pozisyonlarını izleyerek gün sonu getirisini tahmin edin."
      />

      {error && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-800">Günlük Tahmin Ekle</h3>
            <p className="mt-1 text-xs text-slate-500">
              Bir fon kodu girin; FVT&apos;den portföy dağılımı getirilir. Getiri % FVT&apos;den
              gelir; eksik satırlar için İş Yatırım/TEFAS yedek kaynağı kullanılır.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newFundCode}
                onChange={(e) => setNewFundCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addPortfolio();
                }}
                placeholder="Fon Kodu (örn. GAF)"
                aria-label="Fon kodu"
                className="w-48 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-bold uppercase focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={addPortfolio}
                disabled={!newFundCode.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Ekle &amp; Getir
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={normalize}
                onClick={() => setNormalize((v) => !v)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition lg:ml-auto ${
                  normalize
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`relative h-4 w-7 rounded-full transition ${
                    normalize ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                      normalize ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </span>
                Ağırlıkları %100'e normalize et
              </button>
            </div>

            {fundCount > 0 && (
              <p className="mt-3 text-[11px] text-slate-400">
                {fundCount} fon · {trackedStocks} hisse izleniyor
                {normalize
                  ? ' · tahminler izlenen ağırlığa göre %100 baz alınarak ölçeklenir.'
                  : ' · ham ağırlıklı toplam gösteriliyor.'}
              </p>
            )}
          </div>

          <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-slate-50/80 p-4 lg:w-72">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Piyasa Özeti
            </h4>
            <ul className="mt-3 space-y-2.5">
              {MARKET_SUMMARY_SYMBOLS.map(({ key, label }) => {
                const quote = marketData[key];
                return (
                  <li key={key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-600">{label}</span>
                    <div className="text-right">
                      <span className="block font-mono text-sm font-bold tabular-nums text-slate-800">
                        {quote ? formatMarketPrice(key, quote.price) : '—'}
                      </span>
                      <span
                        className={`block font-mono text-[11px] font-semibold tabular-nums ${
                          quote ? changePctClass(quote.change) : 'text-slate-400'
                        }`}
                      >
                        {quote ? formatChangePct(quote.change) : '…'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[10px] text-slate-400">
              Kaynak: Yahoo Finance · sekme açılışında güncellenir
            </p>
          </aside>
        </div>
      </section>

      {portfolios.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-600">Henüz günlük tahmin yok.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            Yatırım fonları gün içi fiyatlarını gizler. Açıklanan en büyük hisse pozisyonlarını ve
            ağırlıklarını buraya girerek, BIST kapanışına göre fonun tahmini getirisini önceden
            hesaplayın.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {portfolios.map((item) => (
            <FundCard
              key={item.fundCode}
              item={item}
              normalize={normalize}
              isLoading={loadingFunds.has(item.fundCode)}
              fetchToken={fetchTokens[item.fundCode] ?? 0}
              fetchError={fetchErrors[item.fundCode] ?? null}
              lastError={lastErrors[item.fundCode] ?? null}
              onClearLastError={() => clearFundLastError(item.fundCode)}
              onRefreshPortfolio={(fundCode) => void handleFetchFvtPortfolio(fundCode)}
              onAddStock={addStock}
              onUpdateStock={updateStock}
              onRemoveStock={removeStock}
              onRemoveFund={removePortfolio}
            />
          ))}
        </div>
      )}
    </div>
  );
}
