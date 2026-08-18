import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FonbulMetricsResponse, FonbulStats, Fund } from '../types';
import { getFonbulMetrics, getFonbulStats } from '../api';
import {
  clearFonbulSearchHistory,
  formatHistoryWhen,
  pushFonbulSearchHistory,
  readFonbulSearchHistory,
  type FonbulSearchHistoryEntry,
} from '../fonbulSearchHistory';
import {
  defaultViewerRange,
  formatDisplayDate,
  presetDateRange,
  toIso,
  type DateParts,
} from '../utils/dateRange';
import ViewHeader from './ViewHeader';
import DateRangeField from './DateRangeField';
import FonBulHeatmap from './FonBulHeatmap';
import TechnicalScreener from './TechnicalScreener';
import FundSearchSelect from './FundSearchSelect';
import { subscribeSyncFinished, getLastSync, syncSourceLabel, type SyncFinishedDetail } from '../syncEvents';

type FonBulTab = 'sync' | 'heatmap' | 'screener';

function formatPrice(p: number): string {
  return p.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatLarge(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

function formatInt(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

function formatPct(n: number | null): string {
  if (n == null) return '—';
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** ((current / previous) - 1) * 100 — previous row is the next index in DESC-sorted data. */
function calcDailyChangePct(currentPrice: number, previousPrice: number): number | null {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(previousPrice) || previousPrice <= 0) {
    return null;
  }
  const pct = (currentPrice / previousPrice - 1) * 100;
  return Number.isFinite(pct) ? pct : null;
}

function formatDailyChangePct(pct: number): string {
  const formatted = pct.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  });
  return `% ${formatted}`;
}

function dailyChangeClass(pct: number | null): string {
  if (pct == null) return 'text-gray-400';
  if (pct > 0) return 'text-green-500';
  if (pct < 0) return 'text-red-500';
  return 'text-gray-400';
}

const METRICS_FETCH_PAGE_SIZE = 100;

/** Cumulative % change: newest vs oldest row in DESC-sorted filtered data. */
function calcTotalPeriodChange(
  rows: Array<{ price: number; price_date: string }>
): number | null {
  if (!rows || rows.length < 2) return null;

  const newestRecord = rows[0];
  const oldestRecord = rows[rows.length - 1];

  if (
    !Number.isFinite(newestRecord.price) ||
    !Number.isFinite(oldestRecord.price) ||
    oldestRecord.price <= 0
  ) {
    return null;
  }

  const change = ((newestRecord.price - oldestRecord.price) / oldestRecord.price) * 100;
  return Number.isFinite(change) ? Math.round(change * 100) / 100 : null;
}

function formatSignedPeriodPct(pct: number): string {
  const formatted = pct.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  });
  return `${formatted}%`;
}

const RANGE_PRESETS = [
  { id: 'all', label: 'Tümü', months: null },
  { id: '1', label: '1 Ay', months: 1 },
  { id: '3', label: '3 Ay', months: 3 },
  { id: '6', label: '6 Ay', months: 6 },
  { id: '12', label: '12 Ay', months: 12 },
] as const;

type RangePresetId = (typeof RANGE_PRESETS)[number]['id'] | 'custom';

const ROW_BG = ['bg-white', 'bg-slate-100'] as const;

const TABLE_COLUMNS = [
  { key: 'date', label: 'Tarih', align: 'left' as const },
  { key: 'price', label: 'Fiyat', align: 'right' as const },
  { key: 'dailyChange', label: 'Günlük Değişim (%)', align: 'right' as const },
  { key: 'portfolio', label: 'Portföy Değeri', align: 'right' as const },
  { key: 'totalPay', label: 'Toplam Pay Değeri', align: 'right' as const },
  { key: 'shares', label: 'Tedavüldeki Pay', align: 'right' as const },
  { key: 'investors', label: 'Yatırımcı Adet', align: 'right' as const },
  { key: 'active', label: 'Aktif Değeri', align: 'right' as const },
  { key: 'occupancy', label: 'Doluluk %', align: 'right' as const },
];

export default function FonBulDataCenter({ funds }: { funds: Fund[] }) {
  const [activeTab, setActiveTab] = useState<FonBulTab>('sync');
  const [stats, setStats] = useState<FonbulStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [fundCode, setFundCode] = useState('PHE');
  const [metrics, setMetrics] = useState<FonbulMetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<FonbulSearchHistoryEntry[]>(() =>
    readFonbulSearchHistory()
  );
  const [dateDefaults] = useState(() => {
    const range = defaultViewerRange();
    return {
      start: range.start,
      end: range.end,
      startIso: toIso(range.start),
      endIso: toIso(range.end),
    };
  });
  const [startParts, setStartParts] = useState<DateParts>(dateDefaults.start);
  const [endParts, setEndParts] = useState<DateParts>(dateDefaults.end);
  const [filterStart, setFilterStart] = useState<string | null>(dateDefaults.startIso);
  const [filterEnd, setFilterEnd] = useState<string | null>(dateDefaults.endIso);
  const [rangePreset, setRangePreset] = useState<RangePresetId>('custom');
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncFinishedDetail | null>(() => getLastSync());

  const startIso = useMemo(() => toIso(startParts), [startParts]);
  const endIso = useMemo(() => toIso(endParts), [endParts]);

  const totalPeriodChange = useMemo(
    () => (metrics?.rows ? calcTotalPeriodChange(metrics.rows) : null),
    [metrics?.rows]
  );

  const loadStats = useCallback(async () => {
    try {
      setStats(await getFonbulStats());
      setStatsError(null);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : 'İstatistikler yüklenemedi.');
    }
  }, []);

  const loadMetrics = useCallback(
    async (
      code: string,
      range: { start?: string; end?: string } = {},
      recordHistory = false
    ) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) return;
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const first = await getFonbulMetrics(trimmed, {
          page: 1,
          pageSize: METRICS_FETCH_PAGE_SIZE,
          start: range.start,
          end: range.end,
        });

        const rows = [...first.rows];
        for (let p = 2; p <= first.totalPages; p++) {
          const next = await getFonbulMetrics(trimmed, {
            page: p,
            pageSize: METRICS_FETCH_PAGE_SIZE,
            start: range.start,
            end: range.end,
          });
          rows.push(...next.rows);
        }

        const data: FonbulMetricsResponse = {
          ...first,
          rows,
          total: rows.length,
          page: 1,
          pageSize: rows.length,
          totalPages: 1,
        };

        setMetrics(data);
        if (recordHistory) {
          setSearchHistory((prev) =>
            pushFonbulSearchHistory(prev, {
              fund_code: data.fund_code,
              fund_name: data.fund_name,
            })
          );
        }
      } catch (e) {
        setMetrics(null);
        setMetricsError(e instanceof Error ? e.message : 'Fon verileri yüklenemedi.');
      } finally {
        setMetricsLoading(false);
      }
    },
    []
  );

  const currentRange = () => ({
    start: filterStart ?? undefined,
    end: filterEnd ?? undefined,
  });

  const refreshData = useCallback(async () => {
    setStatsRefreshing(true);
    try {
      await loadStats();
      await loadMetrics(fundCode, currentRange());
    } finally {
      setStatsRefreshing(false);
    }
  }, [loadStats, loadMetrics, fundCode, filterStart, filterEnd]);

  const isFonbulDataSync = (source: SyncFinishedDetail['source']) =>
    source === 'auto-fonbul' ||
    source === 'fonbul-full' ||
    source === 'recent-daily' ||
    source === 'recent-weekly' ||
    source === 'recent-monthly';

  useEffect(() => {
    void refreshData();
    setLastSync(getLastSync());
  }, [refreshData]);

  useEffect(() => {
    return subscribeSyncFinished((detail) => {
      setLastSync(detail);
      if (isFonbulDataSync(detail.source)) {
        void refreshData();
      }
    });
  }, [refreshData]);

  useEffect(() => {
    if (activeTab === 'sync') {
      void loadStats();
      setLastSync(getLastSync());
    }
  }, [activeTab, loadStats]);

  const searchFund = (code: string, recordHistory: boolean) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setFundCode(trimmed);
    void loadMetrics(trimmed, currentRange(), recordHistory);
  };

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    searchFund(fundCode, true);
  };

  const handleHistorySelect = (code: string) => {
    searchFund(code, true);
  };

  const handleClearHistory = () => {
    clearFonbulSearchHistory();
    setSearchHistory([]);
  };

  const applyRangePreset = (presetId: RangePresetId) => {
    setRangePreset(presetId);
    if (presetId === 'all') {
      setFilterStart(null);
      setFilterEnd(null);
      void loadMetrics(fundCode, {});
      return;
    }
    const preset = RANGE_PRESETS.find((p) => p.id === presetId);
    if (!preset?.months) return;
    const { start, end } = presetDateRange(
      preset.months,
      metrics?.fundMinDate ?? null,
      metrics?.fundMaxDate ?? null
    );
    const startStr = toIso(start);
    const endStr = toIso(end);
    setStartParts(start);
    setEndParts(end);
    setFilterStart(startStr);
    setFilterEnd(endStr);
    void loadMetrics(fundCode, { start: startStr, end: endStr });
  };

  const handleRangeApply = () => {
    setRangePreset('custom');
    if (startIso > endIso) {
      setMetricsError('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
      return;
    }
    setFilterStart(startIso);
    setFilterEnd(endIso);
    void loadMetrics(fundCode, { start: startIso, end: endIso });
  };

  return (
    <div
      className={`mx-auto px-6 py-6 ${activeTab === 'heatmap' || activeTab === 'screener' ? 'max-w-[100vw]' : 'max-w-6xl'}`}
    >
      <ViewHeader
        title="FonBul Temel Analiz Veri Merkezi"
        subtitle="Fonların portföy değerleri, tedavüldeki payları ve yatırımcı adetlerini geriye dönük olarak senkronize edin ve yerel veritabanından görüntüleyin."
        popoutView="fonbul"
      />

      <div className="mb-6 flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('sync')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'sync'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Veri Senkronizasyonu
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('heatmap')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'heatmap'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Isı Haritası
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('screener')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'screener'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Teknik Tarayıcı
        </button>
      </div>

      {activeTab === 'heatmap' ? (
        <FonBulHeatmap />
      ) : activeTab === 'screener' ? (
        <TechnicalScreener />
      ) : (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Arama Geçmişi</h3>
                {searchHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="text-[11px] font-medium text-slate-500 transition hover:text-rose-600"
                  >
                    Temizle
                  </button>
                )}
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                Son aradığınız fonlar burada listelenir. Tıklayarak tekrar açabilirsiniz.
              </p>

              {searchHistory.length === 0 ? (
                <p className="rounded-lg bg-white px-3 py-4 text-center text-xs text-slate-400 ring-1 ring-inset ring-slate-200">
                  Henüz arama yok
                </p>
              ) : (
                <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                  {searchHistory.map((entry) => {
                    const isActive = fundCode === entry.fund_code;
                    return (
                      <li key={entry.fund_code}>
                        <button
                          type="button"
                          onClick={() => handleHistorySelect(entry.fund_code)}
                          disabled={metricsLoading}
                          className={`w-full rounded-lg px-3 py-2 text-left transition disabled:opacity-50 ${
                            isActive
                              ? 'bg-sky-100 ring-1 ring-inset ring-sky-200'
                              : 'bg-white ring-1 ring-inset ring-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className="block text-sm font-bold text-slate-800">{entry.fund_code}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                            {entry.fund_name}
                          </span>
                          <span className="mt-1 block text-[10px] text-slate-400">
                            {formatHistoryWhen(entry.searchedAt)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            <div className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Fon Verilerini Görüntüle</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Fon kodu girerek portföy değeri, tedavüldeki pay, yatırımcı adedi ve doluluk
                    oranını listeleyin.
                  </p>
                </div>
                <form onSubmit={handleLookup} className="flex min-w-[280px] flex-1 flex-wrap items-center gap-2 sm:max-w-md">
                  <div className="min-w-[220px] flex-1">
                    <FundSearchSelect
                      funds={funds}
                      value={fundCode}
                      onChange={(code) => setFundCode(code)}
                      placeholder="Fon kodu veya adı ara…"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={metricsLoading}
                    className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:bg-slate-400"
                  >
                    {metricsLoading ? 'Yükleniyor…' : 'Göster'}
                  </button>
                </form>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Tarih Aralığı</h4>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {metrics?.fundMinDate && metrics?.fundMaxDate
                        ? `Veri: ${formatDisplayDate(metrics.fundMinDate)} — ${formatDisplayDate(metrics.fundMaxDate)}`
                        : 'Fon seçildikten sonra gün/ay/yıl filtresi uygulanır'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {RANGE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyRangePreset(preset.id)}
                        disabled={metricsLoading}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                          rangePreset === preset.id
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <DateRangeField
                    label="Başlangıç"
                    parts={startParts}
                    minIso={metrics?.fundMinDate}
                    maxIso={metrics?.fundMaxDate}
                    focusVariant="sky"
                    onChange={(next) => {
                      setStartParts(next);
                      setRangePreset('custom');
                    }}
                  />
                  <span className="hidden pb-2 text-slate-400 sm:inline" aria-hidden>
                    →
                  </span>
                  <DateRangeField
                    label="Bitiş"
                    parts={endParts}
                    minIso={metrics?.fundMinDate}
                    maxIso={metrics?.fundMaxDate}
                    focusVariant="sky"
                    onChange={(next) => {
                      setEndParts(next);
                      setRangePreset('custom');
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleRangeApply}
                    disabled={metricsLoading || startIso > endIso}
                    className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Aralığı Uygula
                  </button>
                </div>
                {startIso > endIso && (
                  <p className="mt-2 text-xs text-rose-600">
                    Başlangıç tarihi bitiş tarihinden sonra olamaz.
                  </p>
                )}
              </div>

          {metricsError && (
            <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {metricsError}
            </div>
          )}

          {metrics && metrics.rows.length > 0 && (
            <div className="mt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700">
                  {metrics.fund_code} — {metrics.fund_name}
                </p>
                <p className="text-xs text-slate-500">
                  {metrics.total.toLocaleString('tr-TR')} kayıt · yeniden eskiye
                  {metrics.filterStart || metrics.filterEnd ? (
                    <>
                      {' '}
                      ·{' '}
                      {metrics.filterStart && metrics.filterEnd
                        ? `${formatDisplayDate(metrics.filterStart)} — ${formatDisplayDate(metrics.filterEnd)}`
                        : metrics.filterStart
                          ? `${formatDisplayDate(metrics.filterStart)} ve sonrası`
                          : `${formatDisplayDate(metrics.filterEnd!)} ve öncesi`}
                    </>
                  ) : null}
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <div className="max-h-[600px] overflow-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
                    <tr>
                      {TABLE_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className={`border-r border-slate-200 bg-slate-100 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600 last:border-r-0 ${
                            col.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.rows.map((row, rowIndex, rows) => {
                      const prevRow = rows[rowIndex + 1];
                      const dailyPct = prevRow
                        ? calcDailyChangePct(row.price, prevRow.price)
                        : null;

                      return (
                      <tr
                        key={row.id}
                        className={`border-t border-slate-200 ${ROW_BG[rowIndex % 2]} hover:brightness-[0.98]`}
                      >
                        <td
                          title={row.price_date}
                          className="whitespace-nowrap border-r border-slate-200 px-3 py-2 text-slate-600"
                        >
                          {formatDisplayDate(row.price_date)}
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 text-right font-mono font-medium text-slate-800">
                          {formatPrice(row.price)}
                        </td>
                        <td
                          className={`whitespace-nowrap border-r border-slate-200 px-3 py-2 text-right font-mono text-sm font-medium ${dailyChangeClass(dailyPct)}`}
                        >
                          {dailyPct != null ? formatDailyChangePct(dailyPct) : '—'}
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 text-right font-mono text-slate-700">
                          {formatLarge(row.portfolio_value)}
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 text-right font-mono text-slate-700">
                          {formatLarge(row.total_pay_value)}
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 text-right font-mono text-slate-700">
                          {formatLarge(row.total_shares)}
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 text-right font-mono text-slate-700">
                          {formatInt(row.investor_count)}
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 text-right font-mono text-slate-700">
                          {formatLarge(row.active_value)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-700">
                          {formatPct(row.occupancy_rate)}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/80 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Dönemsel Analiz
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {metrics.rows.length >= 2 ? (
                      <>
                        {formatDisplayDate(metrics.rows[metrics.rows.length - 1].price_date)} →{' '}
                        {formatDisplayDate(metrics.rows[0].price_date)}
                      </>
                    ) : (
                      'Seçili aralıkta yeterli veri yok'
                    )}
                  </p>
                </div>
                <div className="flex items-center">
                  <span className="mr-3 text-lg font-bold uppercase tracking-wide text-slate-600">
                    SEÇİLİ ARALIK TOPLAM GETİRİ:
                  </span>
                  <span
                    className={`font-mono text-2xl font-extrabold tabular-nums ${dailyChangeClass(totalPeriodChange)}`}
                  >
                    {totalPeriodChange != null ? formatSignedPeriodPct(totalPeriodChange) : '—'}
                  </span>
                </div>
              </div>
              </div>
            </div>
          )}

          {metrics && metrics.rows.length === 0 && !metricsLoading && (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
              {metrics.fund_code} için FonBul metrik kaydı bulunamadı.
            </div>
          )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-800">Yerel Veri Özeti</h3>
            <button
              type="button"
              onClick={() => void refreshData()}
              disabled={statsRefreshing}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {statsRefreshing ? 'Yenileniyor…' : 'Özeti Yenile'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Senkronize edilen FonBul metrikleri SQLite veritabanında saklanır; yerel veritabanı
            özet istatistikleri aşağıda gösterilir.
          </p>
          {lastSync && (
            <p className="mt-2 text-xs text-slate-500">
              Son senkronizasyon:{' '}
              <span className="font-medium text-slate-700">
                {new Date(lastSync.at).toLocaleString('tr-TR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {' · '}
              <span className="font-medium text-indigo-700">{syncSourceLabel(lastSync.source)}</span>
            </p>
          )}

          {statsError && (
            <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {statsError}
            </div>
          )}

          {stats && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Metrikli satır</p>
                <p className="mt-1 text-lg font-bold text-slate-800">
                  {stats.rowsWithMetrics.toLocaleString('tr-TR')}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fon sayısı</p>
                <p className="mt-1 text-lg font-bold text-slate-800">
                  {stats.fundCount.toLocaleString('tr-TR')}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tarih aralığı</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {stats.minDate && stats.maxDate ? `${stats.minDate} → ${stats.maxDate}` : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Toplam fiyat kaydı</p>
                <p className="mt-1 text-lg font-bold text-slate-800">
                  {stats.totalRows.toLocaleString('tr-TR')}
                </p>
              </div>
            </div>
          )}

          {stats && stats.rowsWithMetrics === 0 && (
            <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
              Henüz FonBul metrik verisi yok. <strong>Ayarlar → Veri Senkronizasyonu</strong>{' '}
              bölümünden günlük veya tam FonBul senkronizasyonu yapın.
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}
