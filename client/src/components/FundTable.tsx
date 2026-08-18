import type { Fund, TaxFilter } from '../types';
import TaxBadge from './TaxBadge';

interface Props {
  funds: Fund[];
  onSelect: (fund: Fund) => void;
  taxFilter: TaxFilter;
  onCycleTaxFilter: () => void;
}

const FILTER_META: Record<TaxFilter, { label: string; cls: string }> = {
  all: { label: 'Tümü', cls: 'bg-slate-200 text-slate-600' },
  free: { label: 'Vergisiz', cls: 'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-300' },
  taxed: { label: 'Vergili', cls: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300' },
};

export default function FundTable({ funds, onSelect, taxFilter, onCycleTaxFilter }: Props) {
  const meta = FILTER_META[taxFilter];
  const next =
    taxFilter === 'all' ? 'Vergisiz' : taxFilter === 'free' ? 'Vergili' : 'Tümü';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fon Kodu
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fon Adı
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  type="button"
                  onClick={onCycleTaxFilter}
                  title={`Filtre: ${meta.label} — tıklayın (sıradaki: ${next})`}
                  className="group inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-indigo-600"
                >
                  Vergi Durumu
                  <span
                    className={
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal ' +
                      meta.cls
                    }
                  >
                    {meta.label}
                  </span>
                  <svg
                    className="h-3.5 w-3.5 text-slate-400 transition group-hover:text-indigo-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.084l3.71-3.853a.75.75 0 111.08 1.04l-4.25 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {funds.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center text-slate-500">
                  Bu filtreyle eşleşen fon bulunamadı.
                </td>
              </tr>
            )}
            {funds.map((fund) => (
              <tr
                key={fund.fund_code}
                onClick={() => onSelect(fund)}
                className="cursor-pointer transition hover:bg-indigo-50/60"
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-semibold text-indigo-700">
                  {fund.fund_code}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {fund.fund_name}
                  {fund.is_active === 0 && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                      Pasif
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <TaxBadge isTaxFree={fund.is_tax_free === 1} />
                </td>
                <td className="px-4 py-3 text-right text-slate-300">
                  <span aria-hidden>›</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
