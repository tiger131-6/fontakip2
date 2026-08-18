import { useEffect, useMemo, useState } from 'react';
import { getHistory } from '../api';
import type { Fund, PricePoint } from '../types';
import ViewHeader from './ViewHeader';

interface Props {
  funds: Fund[];
}

export interface RollingMonth {
  year: number;
  month: number;
  name: string;
}

export interface MonthSnapshot {
  startPrice: number;
  endPrice: number;
  pctChange: number;
}

const TURKISH_MONTHS = [
  'OCAK',
  'ŞUBAT',
  'MART',
  'NİSAN',
  'MAYIS',
  'HAZİRAN',
  'TEMMUZ',
  'AĞUSTOS',
  'EYLÜL',
  'EKİM',
  'KASIM',
  'ARALIK',
] as const;

/** Last 14 calendar months ending in the current month (rolls forward automatically). */
export function getRolling14Months(now = new Date()): RollingMonth[] {
  const months: RollingMonth[] = [];
  for (let offset = 13; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    months.push({
      year,
      month,
      name: TURKISH_MONTHS[d.getMonth()],
    });
  }
  return months;
}

function formatPrice6(value: number): string {
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

function formatPct4(value: number): string {
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

/** First trading price in month = start; last = end (latest for current month). */
export function extractMonthlySnapshot(
  history: PricePoint[],
  year: number,
  month: number
): MonthSnapshot | null {
  const inMonth = history
    .filter((p) => {
      const parts = p.price_date.split('-');
      if (parts.length !== 3) return false;
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      return y === year && m === month && Number.isFinite(p.price) && p.price > 0;
    })
    .sort((a, b) => a.price_date.localeCompare(b.price_date));

  if (inMonth.length === 0) return null;

  const startPrice = inMonth[0].price;
  const endPrice = inMonth[inMonth.length - 1].price;
  if (startPrice <= 0) return null;

  const pctChange = ((endPrice - startPrice) / startPrice) * 100;
  if (!Number.isFinite(pctChange)) return null;

  return { startPrice, endPrice, pctChange };
}

/** Excel-adjacent palette mixed with modern dashboard tokens */
const EXCEL_GRID = 'border border-black';
const EXCEL_HEADER_BG = 'bg-[#D9D9D9]';
const EXCEL_CORNER_BG = 'bg-[#BFBFBF]';
const EXCEL_ROW_LABEL_BG = 'bg-[#F2F2F2]';
const EXCEL_HOVER = 'group-hover:bg-[#DDEBF7]';

function MatrixCell({
  snapshot,
  striped,
}: {
  snapshot: MonthSnapshot | null;
  striped: boolean;
}) {
  const rowBg = striped ? 'bg-[#FAFAFA]' : 'bg-white';

  if (!snapshot) {
    return (
      <td
        className={`${EXCEL_GRID} ${rowBg} p-1.5 text-center text-slate-400 transition-colors duration-150 ${EXCEL_HOVER}`}
      >
        —
      </td>
    );
  }

  const { endPrice, startPrice, pctChange } = snapshot;
  const positive = pctChange > 0;
  const negative = pctChange < 0;
  const pctColor = positive ? 'text-green-600' : negative ? 'text-red-600' : 'text-slate-600';

  return (
    <td
      className={`${EXCEL_GRID} ${rowBg} p-1.5 transition-colors duration-150 ${EXCEL_HOVER}`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-end font-mono tabular-nums text-slate-700">
          <span className="w-full border-b-2 border-black pb-px text-right leading-tight">
            {formatPrice6(endPrice)}
          </span>
          <span className="w-full pt-px text-right leading-tight text-slate-500">
            {formatPrice6(startPrice)}
          </span>
        </div>
        <div
          className={`min-w-[48px] shrink-0 border-l-2 border-black pl-2 text-right font-extrabold tabular-nums ${pctColor}`}
        >
          {formatPct4(pctChange)}
        </div>
      </div>
    </td>
  );
}

export default function Statistics({ funds }: Props) {
  const favoriteFunds = useMemo(() => funds.filter((fund) => fund.is_favorite), [funds]);
  const rollingMonths = useMemo(() => getRolling14Months(), []);
  const [histories, setHistories] = useState<Record<string, PricePoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (favoriteFunds.length === 0) {
      setHistories({});
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    void (async () => {
      const settled = await Promise.allSettled(
        favoriteFunds.map(async (fund) => {
          const res = await getHistory(fund.fund_code);
          return { code: fund.fund_code, history: res.history };
        })
      );

      if (cancelled) return;

      const next: Record<string, PricePoint[]> = {};
      let failed = 0;
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          next[result.value.code] = result.value.history;
        } else {
          failed += 1;
        }
      }

      setHistories(next);
      setError(failed > 0 ? `${failed} favori fon için fiyat geçmişi yüklenemedi.` : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [favoriteFunds]);

  return (
    <div className="mx-auto w-full max-w-[100vw] px-4 py-6 sm:px-6">
      <ViewHeader
        title="İstatistik"
        subtitle="Favori fonlar — son 14 ay için ay sonu / ay başı fiyat ve aylık değişim matrisi."
        popoutView="istatistik"
      />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-2.5">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Favori Fonlar — 14 Aylık Matris</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {favoriteFunds.length} fon · üstte son gün fiyatı, altta ayın ilk günü, sağda aylık %
            </p>
          </div>
          {loading && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
              Yükleniyor…
            </span>
          )}
        </div>

        {error && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {error}
          </div>
        )}

        {favoriteFunds.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">
            Henüz favori fon yok. Fonlar tablosundan yıldız ekleyin.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-x border-t border-black bg-[#217346] px-3 py-1.5 text-[10px] font-medium text-white">
              <span className="rounded bg-white/15 px-2 py-0.5">14 Aylık Matris</span>
              <span className="text-white/80">Üst: ay sonu · Alt: ay başı · Sağ: % değişim</span>
            </div>

            <div className="w-full max-h-[75vh] overflow-auto border border-black bg-white">
              <table className="w-full border-collapse whitespace-nowrap text-left text-[11px]">
                <thead className="font-bold text-slate-800">
                  <tr>
                    <th
                      className={`sticky left-0 top-0 z-30 ${EXCEL_GRID} ${EXCEL_CORNER_BG} px-2 py-1.5 text-left shadow-[2px_2px_4px_rgba(0,0,0,0.08)]`}
                    >
                      AYLAR
                    </th>
                    {favoriteFunds.map((fund) => (
                      <th
                        key={fund.fund_code}
                        className={`sticky top-0 z-20 ${EXCEL_GRID} ${EXCEL_HEADER_BG} px-2 py-1.5 text-center font-mono shadow-[0_2px_4px_rgba(0,0,0,0.06)]`}
                      >
                        {fund.fund_code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && Object.keys(histories).length === 0 ? (
                    <tr>
                      <td
                        colSpan={favoriteFunds.length + 1}
                        className={`${EXCEL_GRID} bg-white p-8 text-center text-slate-400`}
                      >
                        Matris hesaplanıyor…
                      </td>
                    </tr>
                  ) : (
                    rollingMonths.map((row, rowIndex) => {
                      const striped = rowIndex % 2 === 1;
                      return (
                        <tr key={`${row.year}-${row.month}`} className="group">
                          <td
                            className={`sticky left-0 z-10 ${EXCEL_GRID} ${EXCEL_ROW_LABEL_BG} px-2 py-1.5 font-bold uppercase text-slate-800 transition-colors duration-150 ${EXCEL_HOVER}`}
                          >
                            <span>{row.name}</span>
                            <span className="ml-1 font-mono text-[10px] font-semibold text-slate-500">
                              {row.year}
                            </span>
                          </td>
                          {favoriteFunds.map((fund) => {
                            const history = histories[fund.fund_code] ?? [];
                            const snapshot = extractMonthlySnapshot(history, row.year, row.month);
                            return (
                              <MatrixCell
                                key={fund.fund_code}
                                snapshot={snapshot}
                                striped={striped}
                              />
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
