import {
  clampDay,
  clampToBounds,
  daysInMonth,
  MONTH_OPTIONS,
  type DateParts,
  YEAR_OPTIONS,
} from '../utils/dateRange';

const FOCUS_CLASS = {
  indigo:
    'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
  sky: 'focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200',
} as const;

type FocusVariant = keyof typeof FOCUS_CLASS;

export default function DateRangeField({
  label,
  parts,
  onChange,
  minIso,
  maxIso,
  focusVariant = 'indigo',
}: {
  label: string;
  parts: DateParts;
  onChange: (next: DateParts) => void;
  minIso?: string | null;
  maxIso?: string | null;
  focusVariant?: FocusVariant;
}) {
  const selectClass = `rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm ${FOCUS_CLASS[focusVariant]}`;
  const dayOptions = Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, i) => i + 1);

  const handleChange = (next: DateParts) => {
    onChange(clampToBounds(clampDay(next), minIso, maxIso));
  };

  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-500">{label}</label>
      <div className="flex items-center gap-1.5">
        <select
          value={parts.day}
          onChange={(e) => handleChange({ ...parts, day: Number(e.target.value) })}
          className={`${selectClass} w-[52px]`}
          aria-label={`${label} gün`}
        >
          {dayOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={parts.month}
          onChange={(e) => handleChange({ ...parts, month: Number(e.target.value) })}
          className={`${selectClass} min-w-[88px]`}
          aria-label={`${label} ay`}
        >
          {MONTH_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={parts.year}
          onChange={(e) => handleChange({ ...parts, year: Number(e.target.value) })}
          className={`${selectClass} w-[76px]`}
          aria-label={`${label} yıl`}
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
