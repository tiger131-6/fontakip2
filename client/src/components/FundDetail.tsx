import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { Fund, PricePoint } from '../types';
import { getHistory } from '../api';
import {
  calculateReturns,
  filterHistoryByRange,
  type ChartRange,
} from '../utils/calculateReturns';
import {
  buildNormalizedComparisonData,
  type ComparisonChartPoint,
} from '../utils/comparisonChart';
import TaxBadge from './TaxBadge';
import ReturnsCard from './ReturnsCard';
import FundSearchSelect from './FundSearchSelect';
import {
  fetchTefasMinPurchaseInfo,
  type TefasMinPurchaseInfo,
} from '../utils/tefasFundInfo';

interface Props {
  fund: Fund;
  allFunds: Fund[];
  onClose: () => void;
}

interface RawChartDatum {
  date: string;
  price: number;
}

function formatPrice(p: number): string {
  return p.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatPct(p: number): string {
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function formatPortfolioValue(value: number | null | undefined): string {
  if (value == null) return 'Veri Bekleniyor';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Milyar ₺`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Milyon ₺`;
  }
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return 'Veri Bekleniyor';
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

function formatOccupancy(value: number | null | undefined): string {
  if (value == null) return 'Veri Bekleniyor';
  const pct = value <= 1 && value >= 0 ? value * 100 : value;
  return `%${pct.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
}

function MetricCard({ label, value, sub }: MetricCardProps) {
  const pending = value === 'Veri Bekleniyor';
  return (
    <div className="min-w-[140px] flex-1 basis-[calc(33.33%-0.75rem)] rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold tabular-nums ${
          pending ? 'text-slate-400' : 'text-slate-800'
        }`}
      >
        {value}
      </p>
      {sub != null && (
        <p className="mt-0.5 text-[9px] text-slate-400 tabular-nums">{sub}</p>
      )}
    </div>
  );
}

interface InvestorTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { price_date: string; investor_count: number } }>;
}

function InvestorTooltip({ active, payload }: InvestorTooltipProps) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-slate-500">{longDate(datum.price_date)}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-indigo-700">
        {datum.investor_count.toLocaleString('tr-TR')} yatırımcı
      </div>
    </div>
  );
}

interface CompareTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ComparisonChartPoint | RawChartDatum }>;
  baseCode: string;
  compareCode: string | null;
  isCompareMode: boolean;
}

function ChartTooltip({ active, payload, baseCode, compareCode, isCompareMode }: CompareTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;

  if (!isCompareMode || !('baseFundPct' in datum)) {
    const raw = datum as RawChartDatum;
    return (
      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
        <div className="font-medium text-slate-500">{longDate(raw.date)}</div>
        <div className="mt-0.5 font-mono text-sm font-semibold text-indigo-700">
          {formatPrice(raw.price)}
        </div>
      </div>
    );
  }

  const d = datum as ComparisonChartPoint;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-slate-500">{longDate(d.date)}</div>
      <div className="mt-2 space-y-1.5">
        <div>
          <div className="font-semibold text-indigo-600">{baseCode}</div>
          <div className="font-mono text-indigo-700">{formatPct(d.baseFundPct)}</div>
          <div className="text-slate-400">{formatPrice(d.baseFundPrice)}</div>
        </div>
        {compareCode && d.compareFundPct != null && d.compareFundPrice != null && (
          <div>
            <div className="font-semibold text-amber-600">{compareCode}</div>
            <div className="font-mono text-amber-700">{formatPct(d.compareFundPct)}</div>
            <div className="text-slate-400">{formatPrice(d.compareFundPrice)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FundDetail({ fund, allFunds, onClose }: Props) {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<ChartRange>('MAX');

  const [compareFunds, setCompareFunds] = useState<string[]>([]);
  const [compareHistory, setCompareHistory] = useState<PricePoint[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [minPurchase, setMinPurchase] = useState<TefasMinPurchaseInfo | null>(null);

  const compareCode = compareFunds[0] ?? null;

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHistory(fund.fund_code);
      setHistory(res.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Geçmiş yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [fund.fund_code]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setSelectedRange('MAX');
    setCompareFunds([]);
    setCompareHistory([]);
    setCompareError(null);
  }, [fund.fund_code]);

  useEffect(() => {
    let cancelled = false;
    setMinPurchase(null);

    void fetchTefasMinPurchaseInfo(fund.fund_code).then((value) => {
      if (!cancelled) setMinPurchase(value);
    });

    return () => {
      cancelled = true;
    };
  }, [fund.fund_code]);

  useEffect(() => {
    if (!compareCode) {
      setCompareHistory([]);
      setCompareError(null);
      return;
    }

    let cancelled = false;
    setCompareLoading(true);
    setCompareError(null);

    void getHistory(compareCode)
      .then((res) => {
        if (!cancelled) setCompareHistory(res.history);
      })
      .catch((e) => {
        if (!cancelled) {
          setCompareHistory([]);
          setCompareError(e instanceof Error ? e.message : 'Karşılaştırma verisi yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [compareCode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCompareChange = (code: string) => {
    if (!code) {
      setCompareFunds([]);
      return;
    }
    setCompareFunds([code.toUpperCase()]);
  };

  const isCompareMode = compareCode != null && compareHistory.length > 0;

  const filteredHistory = useMemo(
    () => filterHistoryByRange(history, selectedRange),
    [history, selectedRange]
  );

  const rawChartData = useMemo<RawChartDatum[]>(
    () =>
      [...filteredHistory]
        .reverse()
        .map((p) => ({ date: p.price_date, price: p.price })),
    [filteredHistory]
  );

  const filteredChartData = useMemo(
    () =>
      [...filteredHistory]
        .reverse()
        .map((p) => ({
          price_date: p.price_date,
          investor_count: p.investor_count ?? null,
        })),
    [filteredHistory]
  );

  const investorChartData = useMemo(
    () =>
      filteredChartData.filter(
        (p): p is { price_date: string; investor_count: number } => p.investor_count != null
      ),
    [filteredChartData]
  );

  const latestMetrics = useMemo(
    () => history.find((p) => p.portfolio_value != null) ?? history[0],
    [history]
  );

  const minPurchaseCard = useMemo(() => {
    const formatTRY = (n: number) =>
      new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

    // Priority 1 — fixed fiat entry barrier (hedge funds / serbest fonlar).
    if (minPurchase?.explicitTlAmount != null) {
      return {
        value: formatTRY(minPurchase.explicitTlAmount),
        sub: '(Sabit Tutar Limiti)',
      };
    }

    // Priority 2 — share count × current price (regular funds).
    const limitAmount = minPurchase?.shareQuantity ?? 1;

    // History is stored newest-first; price is already a number in state.
    const currentPrice = history[0]?.price ?? 0;
    if (currentPrice <= 0) {
      return { value: `${limitAmount.toLocaleString('tr-TR')} Pay`, sub: undefined };
    }

    return {
      value: formatTRY(limitAmount * currentPrice),
      sub: `(${limitAmount.toLocaleString('tr-TR')} Pay)`,
    };
  }, [minPurchase, history]);

  const comparisonChartData = useMemo(
    () =>
      buildNormalizedComparisonData(
        history,
        compareCode && compareHistory.length > 0
          ? { code: compareCode, history: compareHistory }
          : null,
        selectedRange
      ),
    [history, compareCode, compareHistory, selectedRange]
  );

  const activePointCount = isCompareMode ? comparisonChartData.length : rawChartData.length;

  const returns = useMemo(() => calculateReturns(history), [history]);

  const compareOptions = useMemo(
    () => allFunds.filter((f) => f.fund_code !== fund.fund_code),
    [allFunds, fund.fund_code]
  );

  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (isCompareMode) {
      if (comparisonChartData.length === 0) return undefined;
      const pcts: number[] = [];
      for (const d of comparisonChartData) {
        pcts.push(d.baseFundPct);
        if (d.compareFundPct != null) pcts.push(d.compareFundPct);
      }
      const min = Math.min(...pcts);
      const max = Math.max(...pcts);
      if (min === max) return [min - 1, max + 1];
      const pad = (max - min) * 0.12 || 1;
      return [min - pad, max + pad];
    }

    if (rawChartData.length === 0) return undefined;
    const prices = rawChartData.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) {
      const pad = min === 0 ? 1 : Math.abs(min) * 0.02;
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.15;
    return [min - pad, max + pad];
  }, [isCompareMode, comparisonChartData, rawChartData]);

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-indigo-700">{fund.fund_code}</span>
              <TaxBadge isTaxFree={fund.is_tax_free === 1} />
            </div>
            <p className="mt-1 text-sm text-slate-600">{fund.fund_name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Kapat"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-slate-400">Yükleniyor…</p>
          ) : history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Henüz fiyat kaydı yok. Ayarlar&apos;dan fiyat senkronizasyonu yapın.
            </div>
          ) : (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">
                    {isCompareMode ? 'Getiri Karşılaştırması (%)' : 'Fiyat Trendi'}
                  </h3>
                  {selectedRange !== 'MAX' && (
                    <span className="text-xs text-indigo-600">
                      {activePointCount} kayıt · filtreli
                    </span>
                  )}
                </div>

                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Karşılaştır (Benchmark)
                  </label>
                  <FundSearchSelect
                    funds={compareOptions}
                    value={compareCode ?? ''}
                    onChange={handleCompareChange}
                    allowEmpty
                    emptyLabel="Karşılaştırma yok"
                    placeholder="Fon kodu veya adı ara…"
                  />
                  {compareLoading && (
                    <p className="mt-2 text-xs text-slate-400">Karşılaştırma verisi yükleniyor…</p>
                  )}
                  {compareError && (
                    <p className="mt-2 text-xs text-rose-600">{compareError}</p>
                  )}
                  {isCompareMode && (
                    <p className="mt-2 text-xs text-slate-500">
                      Her iki fon seçili aralığın başında %0&apos;a normalize edilir.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2" style={{ height: 300 }}>
                  {activePointCount < 2 ? (
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-400">
                      {compareLoading
                        ? 'Karşılaştırma grafiği hazırlanıyor…'
                        : 'Trend grafiği için en az 2 fiyat kaydı gerekir.'}
                    </div>
                  ) : isCompareMode ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={comparisonChartData}
                        margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={shortDate}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          minTickGap={24}
                          tickMargin={8}
                          stroke="#cbd5e1"
                        />
                        <YAxis
                          domain={yDomain}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          width={52}
                          tickFormatter={(v: number) =>
                            `${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`
                          }
                          stroke="#cbd5e1"
                        />
                        <Tooltip
                          content={
                            <ChartTooltip
                              baseCode={fund.fund_code}
                              compareCode={compareCode}
                              isCompareMode
                            />
                          }
                        />
                        <Legend
                          verticalAlign="top"
                          height={28}
                          formatter={(value) => (
                            <span className="text-xs text-slate-600">{value}</span>
                          )}
                        />
                        <Line
                          type="monotone"
                          dataKey="baseFundPct"
                          name={fund.fund_code}
                          stroke="#4f46e5"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="compareFundPct"
                          name={compareCode ?? 'Karşılaştırma'}
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={rawChartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={shortDate}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          minTickGap={24}
                          tickMargin={8}
                          stroke="#cbd5e1"
                        />
                        <YAxis
                          domain={yDomain}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          width={64}
                          tickFormatter={(v: number) =>
                            v.toLocaleString('tr-TR', { maximumFractionDigits: 4 })
                          }
                          stroke="#cbd5e1"
                        />
                        <Tooltip
                          content={
                            <ChartTooltip
                              baseCode={fund.fund_code}
                              compareCode={null}
                              isCompareMode={false}
                            />
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="#4f46e5"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>

              <ReturnsCard
                periods={returns}
                selectedRange={selectedRange}
                onSelectRange={setSelectedRange}
              />

              <section className="mt-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">
                  Temel Analiz (Güncel)
                </h3>
                <div className="flex flex-wrap gap-3">
                  <MetricCard
                    label="Portföy Büyüklüğü"
                    value={formatPortfolioValue(latestMetrics?.portfolio_value)}
                  />
                  <MetricCard
                    label="Yatırımcı Sayısı"
                    value={formatCount(latestMetrics?.investor_count)}
                  />
                  <MetricCard
                    label="Doluluk Oranı"
                    value={formatOccupancy(latestMetrics?.occupancy_rate)}
                  />
                  <MetricCard
                    label="Tedavüldeki Pay"
                    value={formatCount(latestMetrics?.total_shares)}
                  />
                  <MetricCard
                    label="Min. Alım Limiti"
                    value={minPurchaseCard.value}
                    sub={minPurchaseCard.sub}
                  />
                </div>
              </section>

              <section className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Yatırımcı Sayısı Trendi</h3>
                  {selectedRange !== 'MAX' && (
                    <span className="text-xs text-indigo-600">
                      {investorChartData.length} kayıt · filtreli
                    </span>
                  )}
                </div>
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-2"
                  style={{ height: 220 }}
                >
                  {investorChartData.length < 2 ? (
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-400">
                      FonBul metrik verisi yok veya seçili aralıkta yeterli kayıt bulunamadı.
                      Ayarlar&apos;dan FonBul senkronizasyonu çalıştırın.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={investorChartData}
                        margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
                      >
                        <defs>
                          <linearGradient id="investorFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="price_date"
                          tickFormatter={shortDate}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          minTickGap={24}
                          tickMargin={8}
                          stroke="#cbd5e1"
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          width={56}
                          tickFormatter={(v: number) =>
                            v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })
                          }
                          stroke="#cbd5e1"
                        />
                        <Tooltip content={<InvestorTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="investor_count"
                          stroke="#4f46e5"
                          strokeWidth={2}
                          fill="url(#investorFill)"
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>

              <section className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Fiyat Geçmişi</h3>
                  <span className="text-xs text-slate-400">{history.length} kayıt</span>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="sticky top-0 z-10 bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Tarih
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Fiyat
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {history.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-sm text-slate-600">{longDate(p.price_date)}</td>
                          <td className="px-3 py-2 text-right font-mono text-sm font-medium text-slate-800">
                            {formatPrice(p.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
