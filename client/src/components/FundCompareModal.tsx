import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { FundTableRow, PricePoint } from '../types';
import { getHistory } from '../api';
import { type ChartRange } from '../utils/calculateReturns';
import {
  buildMultiFundComparisonData,
  COMPARISON_LINE_COLORS,
  type MultiFundChartPoint,
} from '../utils/comparisonChart';
interface Props {
  funds: FundTableRow[];
  onClose: () => void;
}

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: '1M', label: '1 Ay' },
  { value: '3M', label: '3 Ay' },
  { value: '6M', label: '6 Ay' },
  { value: 'YTD', label: 'Yılbaşı' },
  { value: '1Y', label: '1 Yıl' },
  { value: '3Y', label: '3 Yıl' },
  { value: '5Y', label: '5 Yıl' },
  { value: 'MAX', label: 'Tümü' },
];

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function formatPct(p: number): string {
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatPctCell(value: number | null): string {
  if (value == null) return '—';
  return formatPct(value);
}

function formatLarge(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Milyar ₺`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Milyon ₺`;
  }
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
}

const SPEC_ROWS: Array<{
  label: string;
  render: (f: FundTableRow) => string;
}> = [
  { label: 'Yönetim Ücreti', render: () => '—' },
  { label: '1 Ay (%)', render: (f) => formatPctCell(f.returns.m1) },
  { label: '6 Ay (%)', render: (f) => formatPctCell(f.returns.m6) },
  { label: '1 Yıl (%)', render: (f) => formatPctCell(f.returns.y1) },
  {
    label: 'Yatırımcı Sayısı',
    render: (f) =>
      f.metrics.investor_count != null
        ? f.metrics.investor_count.toLocaleString('tr-TR')
        : '—',
  },
  { label: 'Portföy Büyüklüğü', render: (f) => formatLarge(f.metrics.portfolio_value) },
];

function CompareTooltip({
  active,
  payload,
  codes,
}: {
  active?: boolean;
  payload?: Array<{ payload: MultiFundChartPoint }>;
  codes: string[];
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div className="max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-slate-500">{longDate(String(datum.date))}</div>
      <div className="mt-2 space-y-1">
        {codes.map((code, i) => {
          const val = datum[code];
          if (typeof val !== 'number') return null;
          return (
            <div key={code} className="flex items-center justify-between gap-3">
              <span className="font-semibold" style={{ color: COMPARISON_LINE_COLORS[i % COMPARISON_LINE_COLORS.length] }}>
                {code}
              </span>
              <span className="font-mono">{formatPct(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FundCompareModal({ funds, onClose }: Props) {
  const codes = useMemo(() => funds.map((f) => f.fund_code), [funds]);
  const [histories, setHistories] = useState<Record<string, PricePoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<ChartRange>('1Y');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.all(
      codes.map(async (code) => {
        const res = await getHistory(code);
        return [code, res.history] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setHistories(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : 'Karşılaştırma verisi yüklenemedi.';
          setError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [codes]);

  const chartData = useMemo(() => {
    const series = codes
      .filter((code) => (histories[code]?.length ?? 0) > 0)
      .map((code) => ({ code, history: histories[code] }));
    return buildMultiFundComparisonData(series, selectedRange);
  }, [codes, histories, selectedRange]);

  const activeCodes = useMemo(
    () => codes.filter((code) => (histories[code]?.length ?? 0) > 0),
    [codes, histories]
  );

  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (chartData.length === 0) return undefined;
    const pcts: number[] = [];
    for (const point of chartData) {
      for (const code of activeCodes) {
        const v = point[code];
        if (typeof v === 'number') pcts.push(v);
      }
    }
    if (pcts.length === 0) return undefined;
    const min = Math.min(...pcts);
    const max = Math.max(...pcts);
    if (min === max) return [min - 1, max + 1];
    const pad = (max - min) * 0.12 || 1;
    return [min - pad, max + pad];
  }, [chartData, activeCodes]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div className="absolute inset-x-4 top-8 bottom-8 mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:inset-x-8">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Fon Karşılaştırma Matrisi</h2>
            <p className="mt-1 text-sm text-slate-500">
              {funds.length} fon · özellik tablosu ve normalize getiri grafiği
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {funds.map((f) => (
                <span
                  key={f.fund_code}
                  className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800"
                >
                  {f.fund_code}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
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
            <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {error}
            </p>
          )}

          <div className="mb-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">Metrik</th>
                  {funds.map((f) => (
                    <th key={f.fund_code} className="px-3 py-2 text-right font-mono font-bold text-indigo-700">
                      {f.fund_code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SPEC_ROWS.map((row) => (
                  <tr key={row.label} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-medium text-slate-600">{row.label}</td>
                    {funds.map((f) => (
                      <td key={f.fund_code} className="px-3 py-2 text-right font-mono text-slate-700">
                        {row.render(f)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Grafik verileri yükleniyor…</p>
          ) : activeCodes.length < 2 ? (
            <p className="text-sm text-slate-500">
              Karşılaştırma grafiği için seçili fonlarda yeterli fiyat geçmişi bulunamadı.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedRange(opt.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      selectedRange === opt.value
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2" style={{ height: 380 }}>
                {chartData.length < 2 ? (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-400">
                    Seçili dönem için yeterli veri yok.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={shortDate}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        minTickGap={28}
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
                      <Tooltip content={<CompareTooltip codes={activeCodes} />} />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span className="text-xs font-mono font-semibold text-slate-600">{value}</span>
                        )}
                      />
                      {activeCodes.map((code, i) => (
                        <Line
                          key={code}
                          type="monotone"
                          dataKey={code}
                          name={code}
                          stroke={COMPARISON_LINE_COLORS[i % COMPARISON_LINE_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Her fon seçili dönemin başlangıcında %0&apos;a normalize edilir; böylece performans
                doğrudan karşılaştırılabilir.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {funds.map((f) => (
                  <div
                    key={f.fund_code}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <div className="font-mono font-bold text-indigo-700">{f.fund_code}</div>
                    <div className="mt-0.5 line-clamp-2 text-slate-600">{f.fund_name}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
