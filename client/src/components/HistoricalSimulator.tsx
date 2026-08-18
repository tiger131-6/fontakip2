import { useCallback, useEffect, useMemo, useState } from 'react';
import { getHistory } from '../api';
import type { Fund, PricePoint } from '../types';
import { findClosestTradingDayOnOrAfter } from '../utils/calculateReturns';
import ViewHeader from './ViewHeader';
import FundSearchSelect from './FundSearchSelect';

interface Props {
  funds: Fund[];
}

interface SelectedFund {
  code: string;
  customQuantity: number;
  customEntryPrice: number;
  entryDate: string;
}

interface StoredFundPartial {
  code: string;
  customQuantity: number | null;
  customEntryPrice: number | null;
  entryDate?: string;
}

interface WhatIfResult {
  code: string;
  name: string;
  pastPrice: number;
  currentPrice: number;
  quantity: number;
  initialInvestment: number;
  isCustomQuantity: boolean;
  isCustomEntryPrice: boolean;
  isTaxable: boolean;
  currentValue: number;
  grossProfit: number;
  taxAmount: number;
  netProfit: number;
  profitPercentage: number;
  dailyAvgProfit: number;
}

const STORAGE_KEYS = {
  funds: 'historical_funds',
  capital: 'historical_capital',
  date: 'historical_date',
} as const;

const DEFAULT_CAPITAL = '100000';
const DEFAULT_ENTRY_DATE = '2025-01-01';
const CURRENT_TAX_RATE = 17.5;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Normalizes stored dates (YYYY-MM-DD or DD.MM.YYYY) for `<input type="date">`. */
function parseEntryDateIso(raw: string | null): string {
  if (!raw?.trim()) return DEFAULT_ENTRY_DATE;

  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dotMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotMatch) return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;

  return DEFAULT_ENTRY_DATE;
}

function parseOptionalPositiveFloat(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function resolveLotValues(
  code: string,
  customQuantity: number | null,
  customEntryPrice: number | null,
  globalCapital: number,
  entryDate: string
): Promise<{ qty: number; price: number } | null> {
  try {
    const res = await getHistory(code);
    const entryPoint = findClosestTradingDayOnOrAfter(res.history, entryDate);
    const historicalPrice =
      entryPoint && entryPoint.price > 0 ? entryPoint.price : null;

    const price =
      customEntryPrice != null && customEntryPrice > 0
        ? customEntryPrice
        : historicalPrice;
    if (price == null || price <= 0) return null;

    let qty: number;
    if (customQuantity != null && customQuantity > 0) {
      qty = customQuantity;
    } else {
      if (!Number.isFinite(globalCapital) || globalCapital <= 0) return null;
      qty = globalCapital / price;
    }

    return { qty, price };
  } catch {
    return null;
  }
}

function normalizeStoredFund(item: unknown): StoredFundPartial | null {
  if (typeof item === 'string') {
    const code = item.trim().toUpperCase();
    return code ? { code, customQuantity: null, customEntryPrice: null } : null;
  }

  if (!item || typeof item !== 'object') return null;

  const record = item as {
    code?: unknown;
    customQuantity?: unknown;
    customEntryPrice?: unknown;
    entryDate?: unknown;
  };
  const code = typeof record.code === 'string' ? record.code.trim().toUpperCase() : '';
  if (!code) return null;

  const entryDate =
    typeof record.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.entryDate)
      ? record.entryDate
      : undefined;

  return {
    code,
    customQuantity: parseOptionalPositiveFloat(record.customQuantity),
    customEntryPrice: parseOptionalPositiveFloat(record.customEntryPrice),
    entryDate,
  };
}

function isLockedFund(fund: StoredFundPartial): fund is SelectedFund {
  return (
    fund.customQuantity != null &&
    fund.customQuantity > 0 &&
    fund.customEntryPrice != null &&
    fund.customEntryPrice > 0 &&
    fund.entryDate != null &&
    fund.entryDate.length > 0
  );
}

function readStoredFunds(): StoredFundPartial[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.funds);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const result: StoredFundPartial[] = [];
    for (const item of parsed) {
      const fund = normalizeStoredFund(item);
      if (!fund || seen.has(fund.code)) continue;
      seen.add(fund.code);
      result.push(fund);
    }
    return result;
  } catch {
    return [];
  }
}

function readStoredCapital(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.capital);
    if (raw == null || raw.trim() === '') return DEFAULT_CAPITAL;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return String(n);
    return DEFAULT_CAPITAL;
  } catch {
    return DEFAULT_CAPITAL;
  }
}

function readStoredEntryDate(): string {
  try {
    return parseEntryDateIso(localStorage.getItem(STORAGE_KEYS.date));
  } catch {
    return DEFAULT_ENTRY_DATE;
  }
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function formatMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPrice(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatQtyDisplay(n: number, isCustom: boolean): string {
  if (isCustom) {
    return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  }
  return Math.round(n).toLocaleString('tr-TR');
}

function formatPct(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeWhatIf(
  fund: Fund,
  history: PricePoint[],
  quantity: number,
  entryPrice: number,
  daysPassed: number
): WhatIfResult | null {
  const current = history[0];
  if (!current || current.price <= 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;

  const currentPrice = current.price;
  const initialInvestment = quantity * entryPrice;
  const currentValue = quantity * currentPrice;
  const grossProfit = currentValue - initialInvestment;
  const isTaxable = fund.is_tax_free === 0;
  const taxAmount =
    isTaxable && grossProfit > 0 ? grossProfit * (CURRENT_TAX_RATE / 100) : 0;
  const netProfit = grossProfit - taxAmount;
  const profitPercentage = (netProfit / initialInvestment) * 100;
  const dailyAvgProfit = netProfit / daysPassed;

  return {
    code: fund.fund_code,
    name: fund.fund_name,
    pastPrice: entryPrice,
    currentPrice,
    quantity,
    initialInvestment,
    isCustomQuantity: true,
    isCustomEntryPrice: true,
    isTaxable,
    currentValue,
    grossProfit,
    taxAmount,
    netProfit,
    profitPercentage,
    dailyAvgProfit,
  };
}

function ResultCard({
  result,
  isEditing,
  editQuantity,
  editPrice,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditQuantityChange,
  onEditPriceChange,
}: {
  result: WhatIfResult;
  isEditing: boolean;
  editQuantity: number | string;
  editPrice: number | string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditQuantityChange: (value: string) => void;
  onEditPriceChange: (value: string) => void;
}) {
  const profitPositive = result.netProfit > 0;
  const profitNegative = result.netProfit < 0;
  const profitColor = profitPositive
    ? 'text-emerald-700'
    : profitNegative
      ? 'text-red-700'
      : 'text-slate-700';

  return (
    <div className="overflow-hidden rounded-xl border-2 border-slate-800 bg-white shadow-sm">
      <div className="relative border-b-2 border-slate-800 bg-indigo-100 px-3 py-2 text-center">
        {!isEditing && (
          <button
            type="button"
            onClick={onStartEdit}
            className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-200/60"
          >
            Düzenle
          </button>
        )}
        <div className="font-mono text-sm font-bold text-indigo-900">{result.code}</div>
        <div className="truncate text-[10px] font-medium text-indigo-800/80">{result.name}</div>
        <div className="mt-1 text-[10px] font-semibold text-indigo-700/80">
          {result.isTaxable ? 'Vergili · %17,5 stopaj' : 'Vergisiz'}
        </div>
      </div>

      {isEditing ? (
        <>
          <div className="grid grid-cols-2 border-b border-slate-300 bg-sky-50 text-xs">
            <div className="border-r border-slate-300 px-2 py-2">
              <label className="font-semibold uppercase text-slate-600">Adet</label>
              <input
                type="number"
                min="0"
                step="any"
                value={editQuantity}
                onChange={(e) => onEditQuantityChange(e.target.value)}
                placeholder="Adet"
                className="mt-1 w-full rounded border border-slate-300 px-1.5 py-1 font-mono text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="px-2 py-2">
              <label className="font-semibold uppercase text-slate-600">Kâr Oranı</label>
              <div className={`mt-1 font-mono text-sm font-bold tabular-nums ${profitColor}`}>
                {profitPositive ? '▲ ' : profitNegative ? '▼ ' : ''}
                {formatPct(result.profitPercentage)}%
              </div>
            </div>
          </div>

          <div className="border-b border-slate-300 bg-amber-50 px-3 py-2 text-xs">
            <label className="font-semibold uppercase text-slate-600">Giriş Fiyatı</label>
            <input
              type="number"
              min="0"
              step="any"
              value={editPrice}
              onChange={(e) => onEditPriceChange(e.target.value)}
              placeholder="Boş = tarihsel fiyat (ekleme anında)"
              className="mt-1 w-full rounded border border-slate-300 px-1.5 py-1 font-mono text-sm tabular-nums focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 border-b border-slate-300 bg-sky-100 text-xs">
            <div className="border-r border-slate-300 px-2 py-2">
              <div className="font-semibold uppercase text-slate-600">Adet</div>
              <div className="mt-0.5 flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-slate-900">
                <span>{formatQtyDisplay(result.quantity, result.isCustomQuantity)}</span>
                {result.isCustomQuantity && (
                  <span className="text-[10px] font-semibold text-indigo-600" title="Kullanıcı tanımlı adet">
                    🔒 Sabit
                  </span>
                )}
              </div>
            </div>
            <div className="px-2 py-2">
              <div className="font-semibold uppercase text-slate-600">Kâr Oranı</div>
              <div className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${profitColor}`}>
                {profitPositive ? '▲ ' : profitNegative ? '▼ ' : ''}
                {formatPct(result.profitPercentage)}%
              </div>
            </div>
          </div>

          <div className="border-b border-slate-300 bg-amber-50 px-3 py-2 text-xs">
            <div className="font-semibold uppercase text-slate-600">Giriş Fiyatı</div>
            <div
              className={`mt-0.5 flex items-center gap-1 font-mono text-sm font-bold tabular-nums ${
                result.isCustomEntryPrice ? 'text-amber-800' : 'text-slate-900'
              }`}
            >
              <span>{formatPrice(result.pastPrice)}</span>
              {result.isCustomEntryPrice && (
                <span className="text-[10px] font-semibold text-amber-700" title="Kullanıcı tanımlı giriş fiyatı">
                  (Manuel)
                </span>
              )}
            </div>
          </div>
        </>
      )}

      <div className="border-b border-slate-300 bg-emerald-50 px-3 py-2 text-xs">
        <div className="font-semibold uppercase text-slate-600">Şu Anki Değeri</div>
        <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900">
          {formatMoney(result.currentValue)} ₺
        </div>
      </div>

      <div className="border-b border-slate-300 bg-orange-100 px-3 py-2 text-xs">
        <div className="font-semibold uppercase text-slate-700">Net Kâr</div>
        <div className={`mt-0.5 font-mono text-base font-bold tabular-nums ${profitColor}`}>
          {profitPositive ? '+' : ''}
          {formatMoney(result.netProfit)} ₺
        </div>
        <div className="mt-0.5 text-[10px] text-slate-500">
          Anapara: {formatMoney(result.initialInvestment)} ₺
        </div>
      </div>

      {result.taxAmount > 0 && (
        <div className="border-b border-slate-300 bg-rose-50 px-3 py-2 text-xs">
          <div className="font-semibold uppercase text-slate-700">Vergi Kesintisi</div>
          <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-red-700">
            -{formatMoney(result.taxAmount)} ₺
          </div>
          <div className="mt-0.5 text-[10px] text-red-600/80">(%17,5 Otomatik Stopaj)</div>
        </div>
      )}

      {isEditing ? (
        <div className="flex gap-2 bg-violet-50 px-3 py-2">
          <button
            type="button"
            onClick={onSaveEdit}
            className="flex-1 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Kaydet
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="flex-1 rounded-md bg-red-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            İptal
          </button>
        </div>
      ) : (
        <div className="bg-violet-100 px-3 py-2 text-xs">
          <div className="font-semibold uppercase text-slate-700">Günlük Ort.</div>
          <div className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${profitColor}`}>
            {profitPositive ? '+' : ''}
            {formatMoney(result.dailyAvgProfit)} ₺
          </div>
          {result.taxAmount > 0 && (
            <div className="mt-0.5 text-[10px] text-slate-500">Vergi sonrası günlük ortalama</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HistoricalSimulator({ funds }: Props) {
  const tradableFunds = useMemo(
    () =>
      funds
        .filter((f) => f.fund_code !== 'ALTIN' && f.is_active === 1)
        .map((f) => ({ fund_code: f.fund_code, fund_name: f.fund_name })),
    [funds]
  );

  const [capital, setCapital] = useState(readStoredCapital);
  const [entryDate, setEntryDate] = useState(readStoredEntryDate);
  const [pickerCode, setPickerCode] = useState('');
  const [inputQuantity, setInputQuantity] = useState('');
  const [inputEntryPrice, setInputEntryPrice] = useState('');
  const [selectedFunds, setSelectedFunds] = useState<SelectedFund[]>([]);
  const [fundsHydrated, setFundsHydrated] = useState(false);
  const [results, setResults] = useState<WhatIfResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingFundCode, setEditingFundCode] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number | string>('');
  const [editPrice, setEditPrice] = useState<number | string>('');

  const today = useMemo(() => todayIso(), []);
  const capitalNum = Number(capital);

  /** Lock legacy/unlocked funds once using stored defaults; never re-run on global input changes. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = readStoredFunds();
      const fallbackCapital = Number(readStoredCapital());
      const fallbackDate = readStoredEntryDate();

      const resolveToLocked = async (
        fund: StoredFundPartial,
        defaultCapital: number,
        defaultDate: string
      ): Promise<SelectedFund | null> => {
        if (isLockedFund(fund)) return fund;

        const lot = await resolveLotValues(
          fund.code,
          fund.customQuantity,
          fund.customEntryPrice,
          defaultCapital,
          defaultDate
        );
        if (!lot) return null;

        return {
          code: fund.code,
          customQuantity: lot.qty,
          customEntryPrice: lot.price,
          entryDate: fund.entryDate ?? defaultDate,
        };
      };

      let seeds = stored;
      if (seeds.length === 0 && tradableFunds.length > 0) {
        seeds = tradableFunds
          .slice(0, 3)
          .map((f) => ({ code: f.fund_code, customQuantity: null, customEntryPrice: null }));
      }

      const locked: SelectedFund[] = [];
      for (const fund of seeds) {
        const resolved = await resolveToLocked(fund, fallbackCapital, fallbackDate);
        if (resolved) locked.push(resolved);
      }

      if (!cancelled) {
        setSelectedFunds(locked);
        setFundsHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tradableFunds]);

  useEffect(() => {
    if (!fundsHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.funds, JSON.stringify(selectedFunds));
      localStorage.setItem(STORAGE_KEYS.capital, capital);
      localStorage.setItem(STORAGE_KEYS.date, entryDate);
    } catch {
      // Ignore quota / private-mode errors.
    }
  }, [selectedFunds, capital, entryDate, fundsHydrated]);

  const lockFundFromGlobals = async (
    code: string,
    rowQuantity: number | null,
    rowEntryPrice: number | null
  ): Promise<SelectedFund | null> => {
    if (entryDate > today) return null;
    if (!Number.isFinite(capitalNum) || capitalNum <= 0) return null;

    const lot = await resolveLotValues(code, rowQuantity, rowEntryPrice, capitalNum, entryDate);
    if (!lot) return null;

    return {
      code,
      customQuantity: lot.qty,
      customEntryPrice: lot.price,
      entryDate,
    };
  };

  const addFund = async () => {
    const code = pickerCode.trim().toUpperCase();
    if (!code) return;

    if (entryDate > today) {
      setError('Giriş tarihi bugünden sonra olamaz.');
      return;
    }
    if (!Number.isFinite(capitalNum) || capitalNum <= 0) {
      setError('Geçerli bir giriş miktarı girin.');
      return;
    }

    const newCustomQuantity = parseOptionalPositiveFloat(inputQuantity);
    const newCustomEntryPrice = parseOptionalPositiveFloat(inputEntryPrice);
    const existing = selectedFunds.find((f) => f.code === code);

    if (!existing) {
      const locked = await lockFundFromGlobals(code, newCustomQuantity, newCustomEntryPrice);
      if (!locked) {
        setError(`${code} eklenemedi. Tarihsel fiyat veya parametreleri kontrol edin.`);
        return;
      }
      setSelectedFunds((prev) => [...prev, locked]);
      setPickerCode('');
      setInputQuantity('');
      setInputEntryPrice('');
      setError(null);
      return;
    }

    const newLot = await resolveLotValues(
      code,
      newCustomQuantity,
      newCustomEntryPrice,
      capitalNum,
      entryDate
    );

    if (!newLot) {
      setError(
        `${code} maliyetlenmesi için geçerli adet ve giriş fiyatı (veya tarihsel fiyat) gerekli.`
      );
      return;
    }

    const combinedQty = existing.customQuantity + newLot.qty;
    const weightedAvgPrice =
      (existing.customQuantity * existing.customEntryPrice + newLot.qty * newLot.price) /
      combinedQty;

    setSelectedFunds((prev) =>
      prev.map((fund) =>
        fund.code === code
          ? {
              ...fund,
              customQuantity: combinedQty,
              customEntryPrice: weightedAvgPrice,
            }
          : fund
      )
    );
    setPickerCode('');
    setInputQuantity('');
    setInputEntryPrice('');
    setError(null);
  };

  const removeFund = (code: string) => {
    setSelectedFunds((prev) => prev.filter((f) => f.code !== code));
    if (editingFundCode === code) {
      setEditingFundCode(null);
    }
  };

  const startEdit = (code: string) => {
    const fund = selectedFunds.find((f) => f.code === code);
    if (!fund) return;
    setEditingFundCode(code);
    setEditQuantity(String(fund.customQuantity));
    setEditPrice(String(fund.customEntryPrice));
  };

  const cancelEdit = () => {
    setEditingFundCode(null);
  };

  const handleSaveEdit = (code: string) => {
    const customQuantity = parseOptionalPositiveFloat(editQuantity);
    const customEntryPrice = parseOptionalPositiveFloat(editPrice);

    if (customQuantity == null || customEntryPrice == null) {
      setError('Adet ve giriş fiyatı boş bırakılamaz.');
      return;
    }

    setSelectedFunds((prev) =>
      prev.map((fund) =>
        fund.code === code ? { ...fund, customQuantity, customEntryPrice } : fund
      )
    );
    setEditingFundCode(null);
    setError(null);
  };

  const runAnalysis = useCallback(async () => {
    if (selectedFunds.length === 0) {
      setError('En az bir fon seçin.');
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const settled = await Promise.allSettled(
        selectedFunds.map(async (selected) => {
          if (selected.entryDate > today) {
            throw new Error(`${selected.code} için giriş tarihi geçersiz`);
          }

          const res = await getHistory(selected.code);
          const fundDays = daysBetween(selected.entryDate, today);
          const computed = computeWhatIf(
            res.fund,
            res.history,
            selected.customQuantity,
            selected.customEntryPrice,
            fundDays
          );
          if (!computed) {
            throw new Error(`${selected.code} için güncel fiyat veya geçerli maliyet verisi yok`);
          }
          return computed;
        })
      );

      const ok = settled
        .filter((r): r is PromiseFulfilledResult<WhatIfResult> => r.status === 'fulfilled')
        .map((r) => r.value);
      const failed = settled.filter((r) => r.status === 'rejected').length;

      setResults(ok);
      if (failed > 0 && ok.length === 0) {
        setError('Seçili fonlar için hesaplama yapılamadı. Veriyi kontrol edin.');
      } else if (failed > 0) {
        setError(`${failed} fon için veri alınamadı; diğerleri gösteriliyor.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hesaplama başarısız.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFunds, today]);

  useEffect(() => {
    if (!fundsHydrated || selectedFunds.length === 0) return;
    void runAnalysis();
  }, [runAnalysis, selectedFunds, fundsHydrated]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <ViewHeader
        title="Tarihsel Kıyaslama"
        subtitle="Geçmiş bir tarihte yatırsaydınız ne olurdu? Her fon eklendiğinde kendi adet ve giriş fiyatına kilitlenir."
        popoutView="simulator-historical"
      />

      {error && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">What-If Parametreleri</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Giriş Miktarı (₺)</label>
            <input
              type="number"
              min="1"
              step="1000"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Yalnızca yeni eklenecek fonlar için varsayılan. Mevcut kartlar etkilenmez.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Giriş Tarihi</label>
            <input
              type="date"
              max={today}
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              Yalnızca yeni eklenecek fonlar için varsayılan giriş tarihi.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Fon Ekle (çoklu seçim)</label>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[180px] flex-1">
                <FundSearchSelect
                  funds={tradableFunds}
                  value={pickerCode}
                  onChange={setPickerCode}
                  allowEmpty
                  emptyLabel="Fon ara ve ekle…"
                />
              </div>
              <input
                type="number"
                min="0"
                step="1"
                value={inputQuantity}
                onChange={(e) => setInputQuantity(e.target.value)}
                placeholder="Adet (Opsiyonel)"
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <input
                type="number"
                min="0"
                step="0.000001"
                value={inputEntryPrice}
                onChange={(e) => setInputEntryPrice(e.target.value)}
                placeholder="Maliyet Fiyatı"
                className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => void addFund()}
                disabled={!pickerCode}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Ekle
              </button>
              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={loading || selectedFunds.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {loading ? 'Hesaplanıyor…' : 'Yeniden Hesapla'}
              </button>
            </div>
            {selectedFunds.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedFunds.map((fund) => (
                  <span
                    key={fund.code}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-inset ring-indigo-200"
                  >
                    {fund.code}
                    <span className="font-normal text-indigo-600">
                      · {formatQtyDisplay(fund.customQuantity, true)} adet
                    </span>
                    <span className="font-normal text-amber-700">
                      · {formatPrice(fund.customEntryPrice)} ₺
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFund(fund.code)}
                      className="rounded-full px-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-900"
                      aria-label={`${fund.code} kaldır`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {loading && results.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-400">Tarihsel kıyaslama hesaplanıyor…</p>
      ) : results.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500">
          Sonuç görmek için fon seçin ve parametreleri girin.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((result) => (
            <ResultCard
              key={result.code}
              result={result}
              isEditing={editingFundCode === result.code}
              editQuantity={editQuantity}
              editPrice={editPrice}
              onStartEdit={() => startEdit(result.code)}
              onCancelEdit={cancelEdit}
              onSaveEdit={() => handleSaveEdit(result.code)}
              onEditQuantityChange={setEditQuantity}
              onEditPriceChange={setEditPrice}
            />
          ))}
        </div>
      )}
    </div>
  );
}
