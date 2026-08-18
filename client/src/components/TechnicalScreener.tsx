import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getFunds, getTechnicalScreener } from '../api';
import type { TechnicalScreenerResponse } from '../types';
import { calculateRSI, calculateSMA } from '../utils/technicalAnalysis';

type TrendSignal = 'bullish' | 'bearish' | 'neutral';
type RsiSignal = 'oversold' | 'overbought' | 'neutral';

interface ScreenerRow {
  fundCode: string;
  latestPrice: number;
  sma20: number;
  sma50: number;
  rsi: number;
  trendSignal: TrendSignal;
  rsiSignal: RsiSignal;
}

/** Calendar-day lookback — ~90 days yields ≥50 işlem günü for SMA50. */
const LOOKBACK_DAYS = 90;
const MIN_TRADING_DAYS = 50;

type TrendFilter = 'all' | TrendSignal;
type RsiSignalFilter = 'all' | RsiSignal;

interface ColumnFilters {
  fundCode: string;
  priceMin: string;
  priceMax: string;
  rsiMin: string;
  rsiMax: string;
  sma20Min: string;
  sma20Max: string;
  sma50Min: string;
  sma50Max: string;
  trend: TrendFilter;
  rsiSignal: RsiSignalFilter;
}

const EMPTY_FILTERS: ColumnFilters = {
  fundCode: '',
  priceMin: '',
  priceMax: '',
  rsiMin: '',
  rsiMax: '',
  sma20Min: '',
  sma20Max: '',
  sma50Min: '',
  sma50Max: '',
  trend: 'all',
  rsiSignal: 'all',
};

const FILTER_INPUT =
  'w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function inNumericRange(value: number, minRaw: string, maxRaw: string): boolean {
  const min = parseOptionalNumber(minRaw);
  const max = parseOptionalNumber(maxRaw);
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function hasActiveFilters(filters: ColumnFilters): boolean {
  return (
    filters.fundCode.trim() !== '' ||
    filters.priceMin.trim() !== '' ||
    filters.priceMax.trim() !== '' ||
    filters.rsiMin.trim() !== '' ||
    filters.rsiMax.trim() !== '' ||
    filters.sma20Min.trim() !== '' ||
    filters.sma20Max.trim() !== '' ||
    filters.sma50Min.trim() !== '' ||
    filters.sma50Max.trim() !== '' ||
    filters.trend !== 'all' ||
    filters.rsiSignal !== 'all'
  );
}

function applyColumnFilters(rows: ScreenerRow[], filters: ColumnFilters): ScreenerRow[] {
  const q = filters.fundCode.trim().toLocaleLowerCase('tr-TR');
  return rows.filter((row) => {
    if (q && !row.fundCode.toLocaleLowerCase('tr-TR').includes(q)) return false;
    if (!inNumericRange(row.latestPrice, filters.priceMin, filters.priceMax)) return false;
    if (!inNumericRange(row.rsi, filters.rsiMin, filters.rsiMax)) return false;
    if (!inNumericRange(row.sma20, filters.sma20Min, filters.sma20Max)) return false;
    if (!inNumericRange(row.sma50, filters.sma50Min, filters.sma50Max)) return false;
    if (filters.trend !== 'all' && row.trendSignal !== filters.trend) return false;
    if (filters.rsiSignal !== 'all' && row.rsiSignal !== filters.rsiSignal) return false;
    return true;
  });
}

function formatPrice(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatIndicator(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function trendLabel(signal: TrendSignal): string {
  if (signal === 'bullish') return 'YÜKSELİŞ';
  if (signal === 'bearish') return 'DÜŞÜŞ';
  return 'NÖTR';
}

function rsiLabel(signal: RsiSignal): string {
  if (signal === 'oversold') return 'AŞIRI SATIM - UCUZ';
  if (signal === 'overbought') return 'AŞIRI ALIM - RİSKLİ';
  return 'NÖTR';
}

function buildScreenerRows(raw: TechnicalScreenerResponse | null): ScreenerRow[] {
  if (!raw) return [];

  const rows: ScreenerRow[] = [];

  for (const item of raw.series) {
    const closes = item.prices.map((p) => p.price);
    if (closes.length < MIN_TRADING_DAYS) continue;

    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const rsi = calculateRSI(closes, 14);

    if (sma20 == null || sma50 == null || rsi == null) continue;

    let trendSignal: TrendSignal = 'neutral';
    if (sma20 > sma50) trendSignal = 'bullish';
    else if (sma20 < sma50) trendSignal = 'bearish';

    let rsiSignal: RsiSignal = 'neutral';
    if (rsi < 30) rsiSignal = 'oversold';
    else if (rsi > 70) rsiSignal = 'overbought';

    rows.push({
      fundCode: item.fund_code,
      latestPrice: closes[closes.length - 1],
      sma20,
      sma50,
      rsi,
      trendSignal,
      rsiSignal,
    });
  }

  return rows.sort((a, b) => a.fundCode.localeCompare(b.fundCode, 'tr-TR'));
}

export default function TechnicalScreener() {
  const [rawData, setRawData] = useState<TechnicalScreenerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(true);
  const [favoriteFundCodes, setFavoriteFundCodes] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_FILTERS);

  useEffect(() => {
    void getFunds()
      .then((funds) => {
        setFavoriteFundCodes(new Set(funds.filter((f) => f.is_favorite).map((f) => f.fund_code)));
      })
      .catch(() => setFavoriteFundCodes(new Set()));
  }, []);

  const load = useCallback(async () => {
    const toastId = toast.loading('Teknik göstergeler hesaplanıyor...');
    setLoading(true);
    setError(null);
    try {
      const data = await getTechnicalScreener(LOOKBACK_DAYS);
      setRawData(data);
      toast.success('Teknik tarayıcı güncellendi.', { id: toastId });
    } catch (e) {
      setRawData(null);
      const message = e instanceof Error ? e.message : 'Teknik tarayıcı yüklenemedi.';
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allRows = useMemo(() => buildScreenerRows(rawData), [rawData]);

  const baseRows = useMemo(() => {
    if (!showOnlyFavorites) return allRows;
    return allRows.filter((row) => favoriteFundCodes.has(row.fundCode));
  }, [allRows, showOnlyFavorites, favoriteFundCodes]);

  const filteredRows = useMemo(
    () => applyColumnFilters(baseRows, columnFilters),
    [baseRows, columnFilters]
  );

  const filtersActive = hasActiveFilters(columnFilters);

  const setFilter = <K extends keyof ColumnFilters>(key: K, value: ColumnFilters[K]) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">Teknik Tarayıcı</h3>
            <p className="mt-1 text-xs text-slate-400">
              SMA (20/50) ve RSI (14) — son ~{LOOKBACK_DAYS} takvim günü (≥{MIN_TRADING_DAYS} işlem günü)
              fiyat verisiyle hesaplanır.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Görünüm</label>
              <div className="inline-flex rounded-lg border border-slate-600 bg-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setShowOnlyFavorites(false)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                    !showOnlyFavorites
                      ? 'bg-slate-700 text-indigo-300 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tüm Piyasa
                </button>
                <button
                  type="button"
                  onClick={() => setShowOnlyFavorites(true)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                    showOnlyFavorites
                      ? 'bg-slate-700 text-amber-300 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sadece Favoriler
                </button>
              </div>
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => setColumnFilters(EMPTY_FILTERS)}
                className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Filtreleri Temizle
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Yükleniyor…' : 'Yenile'}
            </button>
          </div>
        </div>

        {rawData && (
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-400">
            <span>
              <strong className="text-slate-200">
                {rawData.rangeStart} → {rawData.rangeEnd}
              </strong>
            </span>
            <span>
              {filtersActive
                ? `${filteredRows.length} / ${baseRows.length} fon (filtreli)`
                : showOnlyFavorites
                  ? `${baseRows.length} favori / ${allRows.length} hesaplanan fon`
                  : `${baseRows.length} fon`}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {error}
        </div>
      )}

      {loading && !rawData && (
        <div className="rounded-xl bg-slate-800 px-4 py-12 text-center text-sm text-slate-400">
          Fiyat geçmişi yükleniyor ve göstergeler hesaplanıyor…
        </div>
      )}

      {rawData && baseRows.length === 0 && !loading && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-inset ring-amber-500/30">
          {showOnlyFavorites
            ? 'Favori fonlarınız için yeterli işlem günü verisi yok (SMA50 için en az 50 işlem günü gerekir).'
            : 'Yeterli işlem günü verisi olan fon bulunamadı (SMA50 için en az 50 işlem günü gerekir).'}
        </div>
      )}

      {rawData && baseRows.length > 0 && filteredRows.length === 0 && !loading && (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-inset ring-amber-500/30">
          Filtrelere uygun fon bulunamadı. Kolon filtrelerini gevşetin veya sıfırlayın.
        </div>
      )}

      {baseRows.length > 0 && filteredRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-lg">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-800">
                <tr className="border-b border-slate-700 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Fon Kodu</th>
                  <th className="px-4 py-3 text-right">Güncel Fiyat</th>
                  <th className="px-4 py-3 text-right">RSI (14)</th>
                  <th className="px-4 py-3 text-right">SMA (20)</th>
                  <th className="px-4 py-3 text-right">SMA (50)</th>
                  <th className="px-4 py-3">Trend Sinyali</th>
                  <th className="px-4 py-3">RSI Sinyali</th>
                </tr>
                <tr className="border-b border-slate-700 bg-slate-800/95">
                  <th className="px-2 py-2">
                    <input
                      type="text"
                      value={columnFilters.fundCode}
                      onChange={(e) => setFilter('fundCode', e.target.value)}
                      placeholder="Ara…"
                      className={FILTER_INPUT}
                    />
                  </th>
                  <th className="px-2 py-2">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="any"
                        value={columnFilters.priceMin}
                        onChange={(e) => setFilter('priceMin', e.target.value)}
                        placeholder="Min"
                        className={`${FILTER_INPUT} text-right`}
                      />
                      <input
                        type="number"
                        step="any"
                        value={columnFilters.priceMax}
                        onChange={(e) => setFilter('priceMax', e.target.value)}
                        placeholder="Max"
                        className={`${FILTER_INPUT} text-right`}
                      />
                    </div>
                  </th>
                  <th className="px-2 py-2">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="any"
                        value={columnFilters.rsiMin}
                        onChange={(e) => setFilter('rsiMin', e.target.value)}
                        placeholder="Min"
                        className={`${FILTER_INPUT} text-right`}
                      />
                      <input
                        type="number"
                        step="any"
                        value={columnFilters.rsiMax}
                        onChange={(e) => setFilter('rsiMax', e.target.value)}
                        placeholder="Max"
                        className={`${FILTER_INPUT} text-right`}
                      />
                    </div>
                  </th>
                  <th className="px-2 py-2">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="any"
                        value={columnFilters.sma20Min}
                        onChange={(e) => setFilter('sma20Min', e.target.value)}
                        placeholder="Min"
                        className={`${FILTER_INPUT} text-right`}
                      />
                      <input
                        type="number"
                        step="any"
                        value={columnFilters.sma20Max}
                        onChange={(e) => setFilter('sma20Max', e.target.value)}
                        placeholder="Max"
                        className={`${FILTER_INPUT} text-right`}
                      />
                    </div>
                  </th>
                  <th className="px-2 py-2">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="any"
                        value={columnFilters.sma50Min}
                        onChange={(e) => setFilter('sma50Min', e.target.value)}
                        placeholder="Min"
                        className={`${FILTER_INPUT} text-right`}
                      />
                      <input
                        type="number"
                        step="any"
                        value={columnFilters.sma50Max}
                        onChange={(e) => setFilter('sma50Max', e.target.value)}
                        placeholder="Max"
                        className={`${FILTER_INPUT} text-right`}
                      />
                    </div>
                  </th>
                  <th className="px-2 py-2">
                    <select
                      value={columnFilters.trend}
                      onChange={(e) => setFilter('trend', e.target.value as TrendFilter)}
                      className={FILTER_INPUT}
                    >
                      <option value="all">Tümü</option>
                      <option value="bullish">Yükseliş</option>
                      <option value="bearish">Düşüş</option>
                      <option value="neutral">Nötr</option>
                    </select>
                  </th>
                  <th className="px-2 py-2">
                    <select
                      value={columnFilters.rsiSignal}
                      onChange={(e) => setFilter('rsiSignal', e.target.value as RsiSignalFilter)}
                      className={FILTER_INPUT}
                    >
                      <option value="all">Tümü</option>
                      <option value="oversold">Aşırı Satım</option>
                      <option value="overbought">Aşırı Alım</option>
                      <option value="neutral">Nötr</option>
                    </select>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.fundCode} className="border-b border-slate-800/80 hover:bg-slate-800/40">
                    <td className="px-4 py-2.5 font-mono font-bold text-white">{row.fundCode}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-200">
                      {formatPrice(row.latestPrice)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${
                        row.rsi < 30
                          ? 'text-emerald-400'
                          : row.rsi > 70
                            ? 'text-rose-400'
                            : 'text-slate-300'
                      }`}
                    >
                      {formatIndicator(row.rsi)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-300">
                      {formatIndicator(row.sma20)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-300">
                      {formatIndicator(row.sma50)}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.trendSignal === 'bullish' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                          <span aria-hidden>🚀</span> {trendLabel(row.trendSignal)}
                        </span>
                      ) : row.trendSignal === 'bearish' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                          <span aria-hidden>⚠️</span> {trendLabel(row.trendSignal)}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">{trendLabel(row.trendSignal)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.rsiSignal === 'oversold' ? (
                        <span className="inline-flex rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
                          {rsiLabel(row.rsiSignal)}
                        </span>
                      ) : row.rsiSignal === 'overbought' ? (
                        <span className="inline-flex rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-400 ring-1 ring-inset ring-rose-500/30">
                          {rsiLabel(row.rsiSignal)}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-md bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300 ring-1 ring-inset ring-slate-600">
                          {rsiLabel(row.rsiSignal)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
