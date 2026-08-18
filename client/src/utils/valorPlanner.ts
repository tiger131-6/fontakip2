export interface ValorRules {
  sellValor: number;
  buyValor: number;
}

export interface TransitionStep {
  key: string;
  date: Date;
  title: string;
  description: string;
}

export interface WeekendTrapInfo {
  detected: boolean;
  orderWeekday: number;
  orderWeekdayLabel: string;
  idleCalendarDays: number;
  recommendedStartDate: Date;
  estimatedLostInterest: number;
}

export interface TransitionPlan {
  startDate: Date;
  sellValor: number;
  buyValor: number;
  cashAvailableDate: Date;
  buyOrderDate: Date;
  completeDate: Date;
  idleCalendarDays: number;
  steps: TransitionStep[];
  weekendTrap: WeekendTrapInfo;
}

const WEEKDAY_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const MOCK_ANNUAL_RATE = 0.45;

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function formatDateTr(date: Date): string {
  const d = startOfDay(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const weekday = WEEKDAY_TR[d.getDay()];
  return `${dd}.${mm}.${yyyy} (${weekday})`;
}

export function weekdayLabelTr(date: Date): string {
  return WEEKDAY_TR[startOfDay(date).getDay()];
}

/** Add business days (Mon–Fri only). T+0 returns the same calendar day. */
export function addBusinessDays(start: Date, businessDays: number): Date {
  const d = startOfDay(start);
  if (businessDays <= 0) return d;

  let added = 0;
  while (added < businessDays) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) added += 1;
  }
  return d;
}

export function calendarDaysBetween(start: Date, end: Date): number {
  const a = startOfDay(start).getTime();
  const b = startOfDay(end).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function nextMondayOnOrAfter(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  if (day === 1) return d;
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

/**
 * Infer TEFAS-style settlement valör from şemsiye type (and optional fund code).
 */
export function inferValorFromUmbrella(umbrellaType: string, fundCode = ''): ValorRules {
  const t = umbrellaType.toLocaleLowerCase('tr-TR');
  const code = fundCode.toUpperCase();

  if (t.includes('para piyasası') || t.includes('para piyasasi')) {
    return { sellValor: 0, buyValor: 0 };
  }

  if (
    t.includes('hisse senedi') ||
    t.includes('hisse senedi yoğun') ||
    t.includes('hisse senedi yogun')
  ) {
    return { sellValor: 2, buyValor: 1 };
  }

  if (t.includes('borçlanma') || t.includes('borclanma') || t.includes('eurobond')) {
    return { sellValor: 2, buyValor: 1 };
  }

  if (
    t.includes('kıymetli maden') ||
    t.includes('kiymetli maden') ||
    t.includes('altın') ||
    t.includes('altin') ||
    code === 'ALTIN'
  ) {
    return { sellValor: 1, buyValor: 1 };
  }

  if (t.includes('karma') || t.includes('değişken') || t.includes('degisken')) {
    return { sellValor: 2, buyValor: 1 };
  }

  return { sellValor: 1, buyValor: 1 };
}

export function clampValor(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.round(n)));
}

function estimateLostInterest(amount: number, idleCalendarDays: number): number {
  if (amount <= 0 || idleCalendarDays <= 0) return 0;
  return amount * (MOCK_ANNUAL_RATE / 365) * idleCalendarDays;
}

function idlePeriodIncludesWeekend(start: Date, end: Date): boolean {
  const cursor = startOfDay(start);
  const limit = startOfDay(end).getTime();
  while (cursor.getTime() <= limit) {
    if (isWeekend(cursor)) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

export function buildTransitionPlan(input: {
  startDate: Date;
  sellValor: number;
  buyValor: number;
  amount: number;
  sourceFundCode: string;
  targetFundCode: string;
}): TransitionPlan {
  const startDate = startOfDay(input.startDate);
  const sellValor = clampValor(input.sellValor);
  const buyValor = clampValor(input.buyValor);

  const cashAvailableDate = addBusinessDays(startDate, sellValor);
  const buyOrderDate = cashAvailableDate;
  const completeDate = addBusinessDays(cashAvailableDate, buyValor);
  const idleCalendarDays = calendarDaysBetween(startDate, completeDate);

  const steps: TransitionStep[] = [
    {
      key: 'sell-order',
      date: startDate,
      title: 'Satış Emri Verildi',
      description: `${input.sourceFundCode} fonundan satış emri iletilir ve TEFAS'ta işleme alınır.`,
    },
    {
      key: 'cash-available',
      date: cashAvailableDate,
      title: 'Nakit Hesaba Geçecek',
      description: `Satış valörü (T+${sellValor}) tamamlanır; nakit yatırım hesabında kullanılabilir hale gelir.`,
    },
    {
      key: 'buy-order',
      date: buyOrderDate,
      title: 'Alış Emri Başlayacak',
      description: `Nakit ile ${input.targetFundCode} alış emri verilir (alış valörü T+${buyValor}).`,
    },
    {
      key: 'complete',
      date: completeDate,
      title: 'Geçiş Tamamlandı',
      description: `Hedef fon payları portföyde görünür; geçiş resmen tamamlanmış olur.`,
    },
  ];

  const orderWeekday = startDate.getDay();
  const includesWeekend = idlePeriodIncludesWeekend(startDate, completeDate);
  const isThuOrFri = orderWeekday === 4 || orderWeekday === 5;
  const trapDetected = includesWeekend && isThuOrFri;

  let recommendedStartDate = startDate;
  if (trapDetected) {
    const d = startOfDay(startDate);
    if (orderWeekday === 4) d.setDate(d.getDate() + 4);
    else if (orderWeekday === 5) d.setDate(d.getDate() + 3);
    else d.setDate(d.getDate() + 1);
    recommendedStartDate = nextMondayOnOrAfter(d);
  }

  const altCompleteDate = addBusinessDays(addBusinessDays(recommendedStartDate, sellValor), buyValor);
  const altIdleDays = calendarDaysBetween(recommendedStartDate, altCompleteDate);

  const estimatedLostInterest = trapDetected
    ? Math.max(
        0,
        estimateLostInterest(input.amount, idleCalendarDays) -
          estimateLostInterest(input.amount, altIdleDays)
      )
    : 0;

  return {
    startDate,
    sellValor,
    buyValor,
    cashAvailableDate,
    buyOrderDate,
    completeDate,
    idleCalendarDays,
    steps,
    weekendTrap: {
      detected: trapDetected,
      orderWeekday,
      orderWeekdayLabel: weekdayLabelTr(startDate),
      idleCalendarDays,
      recommendedStartDate,
      estimatedLostInterest,
    },
  };
}

export const VALOR_OPTIONS = [0, 1, 2, 3] as const;
