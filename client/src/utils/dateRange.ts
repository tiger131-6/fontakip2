export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function clampDay(parts: DateParts): DateParts {
  const max = daysInMonth(parts.year, parts.month);
  return parts.day > max ? { ...parts, day: max } : parts;
}

export function fromIso(iso: string): DateParts {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function toIso(parts: DateParts): string {
  const clamped = clampDay(parts);
  return `${clamped.year}-${pad2(clamped.month)}-${pad2(clamped.day)}`;
}

export function clampToBounds(
  parts: DateParts,
  minIso?: string | null,
  maxIso?: string | null
): DateParts {
  let next = clampDay(parts);
  const iso = toIso(next);
  if (minIso && iso < minIso) return fromIso(minIso);
  if (maxIso && iso > maxIso) return fromIso(maxIso);
  return next;
}

export function fromDate(d: Date): DateParts {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/** Data viewer default: today → exactly one calendar month earlier. */
export function defaultViewerRange(): { start: DateParts; end: DateParts } {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 1);
  return {
    start: fromDate(startDate),
    end: fromDate(endDate),
  };
}

/** Default: previous calendar month (1st → last day). */
export function defaultRange(): { start: DateParts; end: DateParts } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return {
    start: { year, month, day: 1 },
    end: { year, month, day: daysInMonth(year, month) },
  };
}

export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export const YEAR_OPTIONS = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - i);

export const MONTH_OPTIONS = [
  { value: 1, label: 'Ocak' },
  { value: 2, label: 'Şubat' },
  { value: 3, label: 'Mart' },
  { value: 4, label: 'Nisan' },
  { value: 5, label: 'Mayıs' },
  { value: 6, label: 'Haziran' },
  { value: 7, label: 'Temmuz' },
  { value: 8, label: 'Ağustos' },
  { value: 9, label: 'Eylül' },
  { value: 10, label: 'Ekim' },
  { value: 11, label: 'Kasım' },
  { value: 12, label: 'Aralık' },
];

export function dateToMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function clampMonth(month: string, min: string | null, max: string | null): string {
  let result = month;
  if (min && result < min) result = min;
  if (max && result > max) result = max;
  return result;
}

/** N calendar months ending at fundMaxDate (or today). */
export function presetDateRange(
  months: number,
  fundMinDate: string | null,
  fundMaxDate: string | null
): { start: DateParts; end: DateParts } {
  const endIso = fundMaxDate ?? new Date().toISOString().slice(0, 10);
  const end = fromIso(endIso);
  const endMonthKey = `${end.year}-${pad2(end.month)}`;
  const minMonthKey = fundMinDate ? dateToMonth(fundMinDate) : null;
  const startMonthKey = clampMonth(addMonths(endMonthKey, -(months - 1)), minMonthKey, endMonthKey);
  const [sy, sm] = startMonthKey.split('-').map(Number);
  return {
    start: { year: sy, month: sm, day: 1 },
    end: {
      year: end.year,
      month: end.month,
      day: fundMaxDate ? end.day : daysInMonth(end.year, end.month),
    },
  };
}
