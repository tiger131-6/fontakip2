import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import type { Fund } from '../types';
import { getFundOverview } from '../api';
import {
  VALOR_OPTIONS,
  buildTransitionPlan,
  formatDateTr,
  inferValorFromUmbrella,
  type TransitionPlan,
} from '../utils/valorPlanner';
import FundSearchSelect from './FundSearchSelect';

interface Props {
  funds: Fund[];
}

function formatMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ValorPlanner({ funds }: Props) {
  const [umbrellaByCode, setUmbrellaByCode] = useState<Record<string, string>>({});
  const [sourceCode, setSourceCode] = useState('');
  const [targetCode, setTargetCode] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [sellValorOverride, setSellValorOverride] = useState<number | 'auto'>('auto');
  const [buyValorOverride, setBuyValorOverride] = useState<number | 'auto'>('auto');
  const [plan, setPlan] = useState<TransitionPlan | null>(null);

  const activeFunds = useMemo(
    () =>
      [...funds]
        .filter((f) => f.is_active === 1)
        .sort((a, b) => a.fund_code.localeCompare(b.fund_code, 'tr-TR')),
    [funds]
  );

  useEffect(() => {
    void getFundOverview()
      .then((res) => {
        const map: Record<string, string> = {};
        for (const row of res.rows) {
          map[row.fund_code] = row.umbrella_type;
        }
        setUmbrellaByCode(map);
      })
      .catch(() => setUmbrellaByCode({}));
  }, []);

  useEffect(() => {
    if (!sourceCode && activeFunds.length > 0) setSourceCode(activeFunds[0].fund_code);
    if (!targetCode && activeFunds.length > 1) setTargetCode(activeFunds[1].fund_code);
  }, [activeFunds, sourceCode, targetCode]);

  const sourceRules = useMemo(() => {
    if (!sourceCode) return { sellValor: 1, buyValor: 1 };
    return inferValorFromUmbrella(umbrellaByCode[sourceCode] ?? '', sourceCode);
  }, [sourceCode, umbrellaByCode]);

  const targetRules = useMemo(() => {
    if (!targetCode) return { sellValor: 1, buyValor: 1 };
    return inferValorFromUmbrella(umbrellaByCode[targetCode] ?? '', targetCode);
  }, [targetCode, umbrellaByCode]);

  const effectiveSellValor = sellValorOverride === 'auto' ? sourceRules.sellValor : sellValorOverride;
  const effectiveBuyValor = buyValorOverride === 'auto' ? targetRules.buyValor : buyValorOverride;

  const handlePlan = () => {
    if (!sourceCode || !targetCode) {
      toast.error('Kaynak ve hedef fon seçin.');
      return;
    }
    if (sourceCode === targetCode) {
      toast.error('Kaynak ve hedef fon farklı olmalıdır.');
      return;
    }
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Geçerli bir geçiş tutarı girin.');
      return;
    }

    const result = buildTransitionPlan({
      startDate: new Date(`${startDate}T12:00:00`),
      sellValor: effectiveSellValor,
      buyValor: effectiveBuyValor,
      amount: parsedAmount,
      sourceFundCode: sourceCode,
      targetFundCode: targetCode,
    });

    setPlan(result);
    toast.success('Geçiş rotası oluşturuldu!');
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Valör Takvimi ve Akıllı Geçiş Planlayıcı</h2>
        <p className="mt-1 text-sm text-slate-500">
          T+1 / T+2 / T+3 valör kurallarıyla fon geçişinizi planlayın; hafta sonu tuzaklarını önceden görün.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Geçiş Parametreleri</h3>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Satılacak Fon</label>
            <FundSearchSelect
              funds={activeFunds}
              value={sourceCode}
              excludeCodes={targetCode ? [targetCode] : []}
              onChange={(code) => {
                setSourceCode(code);
                setSellValorOverride('auto');
                setPlan(null);
              }}
              required
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Şemsiye: {umbrellaByCode[sourceCode] ?? '—'} · Satış valörü öneri: T+{sourceRules.sellValor}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Alınacak Fon</label>
            <FundSearchSelect
              funds={activeFunds}
              value={targetCode}
              excludeCodes={sourceCode ? [sourceCode] : []}
              onChange={(code) => {
                setTargetCode(code);
                setBuyValorOverride('auto');
                setPlan(null);
              }}
              required
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Şemsiye: {umbrellaByCode[targetCode] ?? '—'} · Alış valörü öneri: T+{targetRules.buyValor}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">İşlem Başlangıç Tarihi</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPlan(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Geçiş Tutarı (₺)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setPlan(null);
              }}
              placeholder="100.000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Satış Valörü (T+n)</label>
            <select
              value={sellValorOverride === 'auto' ? 'auto' : String(sellValorOverride)}
              onChange={(e) => {
                setSellValorOverride(e.target.value === 'auto' ? 'auto' : Number(e.target.value));
                setPlan(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="auto">Otomatik (T+{sourceRules.sellValor})</option>
              {VALOR_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  T+{v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Alış Valörü (T+n)</label>
            <select
              value={buyValorOverride === 'auto' ? 'auto' : String(buyValorOverride)}
              onChange={(e) => {
                setBuyValorOverride(e.target.value === 'auto' ? 'auto' : Number(e.target.value));
                setPlan(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="auto">Otomatik (T+{targetRules.buyValor})</option>
              {VALOR_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  T+{v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePlan}
          className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          Geçiş Rotasını Planla
        </button>
      </section>

      {plan && (
        <div className="mt-6 space-y-4">
          {plan.weekendTrap.detected && (
            <div className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 shadow-sm ring-1 ring-inset ring-amber-200">
              <p className="text-sm font-bold text-amber-900">
                ⚠️ Hafta Sonu Tuzağı Algılandı!
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-900/90">
                Bu işlemi bugün ({plan.weekendTrap.orderWeekdayLabel}) başlatırsanız paranız hafta sonu
                boyunca havada kalacak ve getiri üretemeyecektir. Toplam boşta kalma:{' '}
                <strong>{plan.weekendTrap.idleCalendarDays} takvim günü</strong>.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-800">
                Bu işlemi{' '}
                <strong>{formatDateTr(plan.weekendTrap.recommendedStartDate)}</strong> sabahı başlatırsanız,
                nakit boşluğunu azaltarak tahmini{' '}
                <strong>{formatMoney(plan.weekendTrap.estimatedLostInterest)} ₺</strong> repo/faiz kaybını
                önleyebilirsiniz (%45 yıllık oran varsayımı).
              </p>
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">Geçiş Zaman Çizelgesi</h3>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                  Satış T+{plan.sellValor}
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">
                  Alış T+{plan.buyValor}
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
                  Boşta: {plan.idleCalendarDays} gün
                </span>
              </div>
            </div>

            <ol className="relative border-l-2 border-indigo-200 pl-6">
              {plan.steps.map((step, idx) => (
                <li key={step.key} className={`relative ${idx < plan.steps.length - 1 ? 'mb-8' : ''}`}>
                  <span className="absolute -left-[1.65rem] flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white ring-4 ring-white">
                    {idx + 1}
                  </span>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                    {formatDateTr(step.date)}
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.description}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
