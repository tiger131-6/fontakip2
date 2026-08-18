import type { ChartRange, ReturnPeriod } from '../utils/calculateReturns';

interface Props {
  periods: ReturnPeriod[];
  selectedRange: ChartRange;
  onSelectRange: (range: ChartRange) => void;
}

function ReturnRow({
  label,
  value,
  active,
  onClick,
  hideValue,
}: ReturnPeriod & { active: boolean; onClick: () => void; hideValue?: boolean }) {
  const base =
    'flex w-full cursor-pointer justify-between rounded-r px-2 py-1.5 text-sm transition';
  const state = active
    ? 'border-l-4 border-blue-500 bg-blue-50'
    : 'border-l-4 border-transparent hover:bg-gray-50';

  const valueEl =
    value === '-' ? (
      <span className="font-mono text-gray-400">-</span>
    ) : (
      (() => {
        const num = Number(value);
        const positive = num > 0;
        const negative = num < 0;
        const color = positive ? 'text-teal-500' : negative ? 'text-red-500' : 'text-gray-400';
        const arrow = positive ? '▲' : negative ? '▼' : '';
        return (
          <span className={`font-mono font-medium tabular-nums ${color}`}>
            {arrow && <span className="mr-1">{arrow}</span>}
            {value}%
          </span>
        );
      })()
    );

  return (
    <button type="button" onClick={onClick} className={`${base} ${state} text-left`}>
      <span className={active ? 'font-medium text-gray-800' : 'text-gray-600'}>{label}</span>
      {!hideValue && valueEl}
    </button>
  );
}

/** Getiri Oranları — click a row to filter the price chart above. */
export default function ReturnsCard({ periods, selectedRange, onSelectRange }: Props) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Getiri Oranları</h3>
      <p className="mb-2 text-xs text-slate-400">Grafiği filtrelemek için bir satıra tıklayın.</p>
      <div className="rounded border border-gray-200 p-2">
        <ReturnRow
          label="Tümü (MAX)"
          value="-"
          range="MAX"
          hideValue
          active={selectedRange === 'MAX'}
          onClick={() => onSelectRange('MAX')}
        />
        {periods.map((p) => (
          <ReturnRow
            key={p.range}
            {...p}
            active={selectedRange === p.range}
            onClick={() => onSelectRange(p.range)}
          />
        ))}
      </div>
    </section>
  );
}
