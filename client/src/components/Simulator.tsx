import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { Fund, FundCagrResult } from '../types';
import { getFundCagr } from '../api';
import ViewHeader from './ViewHeader';
import FundSearchSelect from './FundSearchSelect';

interface Props {
  funds: Fund[];
}

interface ProjectionPoint {
  year: number;
  principal: number;
  expectedProfit: number;
  expectedValue: number;
  worstCase: number;
  bestCase: number;
}

interface ProjectionResult {
  chartData: ProjectionPoint[];
  totalPrincipal: number;
  finalExpected: number;
  finalNominal: number;
  finalWorst: number;
  finalBest: number;
  nominalCagrPct: number | null;
  realCagrPct: number | null;
}

function formatMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `%${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAxisValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

function computeRealCagrDecimal(nominalCagr: number, inflationPct: number): number {
  if (inflationPct <= 0) return nominalCagr;
  return (1 + nominalCagr) / (1 + inflationPct / 100) - 1;
}

function formatDurationLabel(years: number, months: number): string {
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yıl`);
  if (months > 0) parts.push(`${months} ay`);
  return parts.length > 0 ? parts.join(' ') : '—';
}

/** Lump-sum compound growth; duration may include fractional years (months). */
function runLumpSumProjection(
  principal: number,
  totalYears: number,
  nominalCagr: number,
  inflationPct: number
): ProjectionResult | null {
  if (principal <= 0 || totalYears <= 0 || !Number.isFinite(principal) || !Number.isFinite(totalYears)) {
    return null;
  }

  const durationYears = Math.min(totalYears, 40);
  if (durationYears <= 0) return null;

  const realCagr = computeRealCagrDecimal(nominalCagr, inflationPct);
  const worstCagr = realCagr * 0.8;
  const bestCagr = realCagr * 1.2;

  const chartData: ProjectionPoint[] = [
    {
      year: 0,
      principal,
      expectedProfit: 0,
      expectedValue: principal,
      worstCase: principal,
      bestCase: principal,
    },
  ];

  const pushPoint = (t: number) => {
    const expectedValue = principal * Math.pow(1 + realCagr, t);
    const worstCase = principal * Math.pow(1 + worstCagr, t);
    const bestCase = principal * Math.pow(1 + bestCagr, t);
    chartData.push({
      year: t,
      principal,
      expectedProfit: Math.max(0, expectedValue - principal),
      expectedValue,
      worstCase,
      bestCase,
    });
  };

  const fullYears = Math.floor(durationYears);
  for (let y = 1; y <= fullYears; y++) {
    pushPoint(y);
  }
  if (durationYears > fullYears || fullYears === 0) {
    pushPoint(durationYears);
  }

  const last = chartData[chartData.length - 1];
  const finalNominal = principal * Math.pow(1 + nominalCagr, durationYears);
  const nominalCagrPct = nominalCagr * 100;
  const realCagrPct = realCagr * 100;

  return {
    chartData,
    totalPrincipal: principal,
    finalExpected: last.expectedValue,
    finalNominal,
    finalWorst: last.worstCase,
    finalBest: last.bestCase,
    nominalCagrPct: Number.isFinite(nominalCagrPct) ? nominalCagrPct : null,
    realCagrPct: Number.isFinite(realCagrPct) ? realCagrPct : null,
  };
}

function ProjectionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    dataKey?: string;
    payload?: ProjectionPoint;
  }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;

  return (
    <div className="min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-2 font-semibold text-slate-700">{label}. yıl</div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-mono font-medium text-slate-800">
              {formatMoney(Number(entry.value ?? 0))} ₺
            </span>
          </div>
        ))}
        {row && (
          <div className="mt-1 border-t border-slate-100 pt-1 font-medium text-slate-700">
            Beklenen Toplam: {formatMoney(row.expectedValue)} ₺
          </div>
        )}
      </div>
    </div>
  );
}

export default function Simulator({ funds }: Props) {
  const [fundCode, setFundCode] = useState('');
  const [amount, setAmount] = useState('100000');
  const [years, setYears] = useState('10');
  const [months, setMonths] = useState('0');
  const [inflation, setInflation] = useState('0');
  const [cagrData, setCagrData] = useState<FundCagrResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tradableFunds = useMemo(
    () =>
      funds
        .filter((f) => f.fund_code !== 'ALTIN')
        .sort((a, b) => a.fund_code.localeCompare(b.fund_code, 'tr-TR')),
    [funds]
  );

  useEffect(() => {
    if (!fundCode && tradableFunds.length > 0) {
      setFundCode(tradableFunds[0].fund_code);
    }
  }, [fundCode, tradableFunds]);

  useEffect(() => {
    if (!fundCode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getFundCagr(fundCode)
      .then((data) => {
        if (!cancelled) setCagrData(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'CAGR yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fundCode]);

  const amountNum = Number(amount);
  const yearsNum = years === '' ? 0 : Number(years);
  const monthsNum = months === '' ? 0 : Number(months);
  const inflationNum = Number(inflation);
  const nominalCagr = cagrData?.cagr ?? 0;
  const totalDurationYears = useMemo(() => {
    if (!Number.isFinite(yearsNum) || !Number.isFinite(monthsNum) || yearsNum < 0 || monthsNum < 0) {
      return 0;
    }
    const totalMonths = yearsNum * 12 + monthsNum;
    if (totalMonths <= 0) return 0;
    return Math.min(totalMonths / 12, 40);
  }, [yearsNum, monthsNum]);
  const durationLabel = formatDurationLabel(
    Number.isFinite(yearsNum) && yearsNum > 0 ? Math.floor(yearsNum) : 0,
    Number.isFinite(monthsNum) && monthsNum > 0 ? Math.floor(monthsNum) : 0
  );

  const projection = useMemo(
    () =>
      runLumpSumProjection(
        amountNum,
        totalDurationYears,
        nominalCagr,
        Number.isFinite(inflationNum) ? inflationNum : 0
      ),
    [amountNum, totalDurationYears, nominalCagr, inflationNum]
  );

  const chartData = projection?.chartData ?? [];
  const inflationActive = inflationNum > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <ViewHeader
        title="Simülatör"
        subtitle="Tek seferlik yatırım tutarını girin — fonun tarihsel getirisiyle bileşik büyüme projeksiyonu."
        popoutView="simulator"
      />

      {error && (
        <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">Fon Seçin</label>
          <FundSearchSelect
            funds={tradableFunds}
            value={fundCode}
            onChange={setFundCode}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Yatırım Tutarı (₺)</label>
          <input
            type="number"
            min="1"
            step="1000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Örn. 100000"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-[11px] text-slate-400">Başlangıçta yatırılan toplam tutar</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Yatırım Süresi (Yıl)</label>
          <input
            type="number"
            min="0"
            max="40"
            step="1"
            value={years}
            onChange={(e) => setYears(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <label className="mb-1 mt-3 block text-xs font-medium text-slate-500">Yatırım Süresi (Ay)</label>
          <input
            type="number"
            min="0"
            max="480"
            step="1"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">Beklenen Enflasyon (%)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={inflation}
            onChange={(e) => setInflation(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-[11px] text-slate-400">Reel getiri hesabı için (0 = nominal CAGR kullanılır)</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-slate-500">Tarihsel Nominal CAGR</div>
          <div className="mt-1 text-xl font-bold text-indigo-700">
            {loading ? '…' : formatPct(projection?.nominalCagrPct ?? cagrData?.cagr_pct ?? null)}
          </div>
          {cagrData?.start_date && cagrData.end_date && (
            <div className="mt-0.5 text-xs text-slate-500">
              {cagrData.start_date} → {cagrData.end_date}
            </div>
          )}
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            inflationActive
              ? 'border-amber-200 bg-amber-50/60'
              : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div
            className={`text-xs font-semibold uppercase ${
              inflationActive ? 'text-amber-700' : 'text-slate-500'
            }`}
          >
            Reel CAGR {inflationActive ? `(Enf. %${inflationNum})` : ''}
          </div>
          <div
            className={`mt-1 text-xl font-bold ${
              inflationActive ? 'text-amber-800' : 'text-slate-600'
            }`}
          >
            {loading ? '…' : formatPct(projection?.realCagrPct ?? null)}
          </div>
          {!inflationActive && (
            <div className="mt-0.5 text-xs text-slate-400">Enflasyon 0 — nominal ile aynı</div>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-slate-500">Yatırılan Anapara</div>
          <div className="mt-1 text-xl font-bold text-blue-700">
            {projection ? `${formatMoney(projection.totalPrincipal)} ₺` : '—'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Tek seferlik başlangıç tutarı</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-700">Bugünün Alım Gücü Değeri</div>
          <div className="mt-1 text-2xl font-bold text-emerald-800">
            {projection ? `${formatMoney(projection.finalExpected)} ₺` : '—'}
          </div>
          {projection && projection.finalExpected > projection.totalPrincipal && (
            <div className="mt-0.5 text-xs text-emerald-600">
              +{formatMoney(projection.finalExpected - projection.totalPrincipal)} ₺ reel kâr
            </div>
          )}
          {inflationActive && (
            <div className="mt-0.5 text-xs text-emerald-600/80">Enflasyona göre düzeltilmiş</div>
          )}
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-violet-700">Dönem Sonu Nominal Değer</div>
          <div className="mt-1 text-2xl font-bold text-violet-800">
            {projection ? `${formatMoney(projection.finalNominal)} ₺` : '—'}
          </div>
          {projection && projection.finalNominal > projection.totalPrincipal && (
            <div className="mt-0.5 text-xs text-violet-600">
              +{formatMoney(projection.finalNominal - projection.totalPrincipal)} ₺ nominal kâr
            </div>
          )}
          <div className="mt-0.5 text-xs text-violet-600/80">Hesapta görünen tutar</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Bileşik Büyüme Projeksiyonu</h3>
          <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm bg-blue-500" /> Anapara
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm bg-emerald-500" /> Bileşik Kâr
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 border-t-2 border-dashed border-teal-500" /> İyi (+20%)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 border-t-2 border-dashed border-red-500" /> Kötü (−20%)
            </span>
          </div>
        </div>

        {chartData.length < 2 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            Geçerli bir yatırım tutarı ve süre girin.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: '#64748b' }}
                label={{ value: 'Yıl', position: 'insideBottom', offset: -2, fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={formatAxisValue}
                width={48}
              />
              <Tooltip content={<ProjectionTooltip />} />
              <Legend
                verticalAlign="top"
                height={32}
                formatter={(value) => (
                  <span className="text-xs text-slate-600">{value}</span>
                )}
              />
              <Area
                type="monotone"
                dataKey="principal"
                stackId="1"
                fill="#3b82f6"
                fillOpacity={0.85}
                stroke="#2563eb"
                strokeWidth={1.5}
                name="Anapara"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="expectedProfit"
                stackId="1"
                fill="#10b981"
                fillOpacity={0.85}
                stroke="#059669"
                strokeWidth={1.5}
                name="Bileşik Kâr"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="bestCase"
                stroke="#14b8a6"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="İyi Senaryo (+20%)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="worstCase"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="Kötü Senaryo (-20%)"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {projection && (
          <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:grid-cols-2">
            <span>
              Kötü senaryo ({durationLabel}):{' '}
              <strong className="font-mono text-red-600">{formatMoney(projection.finalWorst)} ₺</strong>
            </span>
            <span>
              İyi senaryo ({durationLabel}):{' '}
              <strong className="font-mono text-teal-600">{formatMoney(projection.finalBest)} ₺</strong>
            </span>
          </div>
        )}

        <p className="mt-2 text-xs text-slate-500">
          Formül: Değer = Anapara × (1 + Reel CAGR)^yıl. Reel CAGR = ((1 + Nominal) / (1 + Enflasyon)) − 1.
          Stres testi: reel CAGR ±%20. Geçmiş performans gelecek getiriyi garanti etmez.
        </p>
      </div>
    </div>
  );
}
