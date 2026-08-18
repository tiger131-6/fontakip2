import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import type { FundTableRow, FundTableReturns, TaxFilter } from '../types';
import { addToWatchlist, getFundOverview, patchFundOverviewFavorite, removeFromWatchlist } from '../api';
import { umbrellaDotColor } from '../utils/umbrellaType';
import {
  FUND_TITLE_TYPE_FILTER_OPTIONS,
  type FundTitleTypeFilter,
} from '../utils/fundTitleType';
import FundCompareModal from './FundCompareModal';
import ViewHeader from './ViewHeader';
import TaxBadge from './TaxBadge';
type SortKey =
  | keyof FundTableReturns
  | 'fund_code'
  | 'fund_name'
  | 'umbrella_type';
type SortDir = 'asc' | 'desc';

const RETURN_COLUMNS: { key: keyof FundTableReturns; label: string }[] = [
  { key: 'm1', label: '1 Ay (%)' },
  { key: 'm3', label: '3 Ay (%)' },
  { key: 'm6', label: '6 Ay (%)' },
  { key: 'ytd', label: 'Yılbaşından İtibaren (%)' },
  { key: 'y1', label: '1 Yıl (%)' },
  { key: 'y3', label: '3 Yıl (%)' },
  { key: 'y5', label: '5 Yıl (%)' },
];

/** Sticky header cells — must be on each th for reliable table stickiness. */
const TH_STICKY =
  'sticky top-0 z-20 bg-[#1e3a8a] shadow-[0_2px_6px_rgba(0,0,0,0.18)]';

const UMBRELLA_FILTER_OPTIONS = [
  { value: 'all', label: 'Tümü' },
  { value: 'Hisse Senedi Şemsiye Fonu', label: 'Hisse Senedi Şemsiye Fonu' },
  { value: 'Serbest Şemsiye Fonu', label: 'Serbest Şemsiye Fonu' },
  { value: 'Değişken Şemsiye Fonu', label: 'Değişken Şemsiye Fonu' },
  { value: 'Para Piyasası Şemsiye Fonu', label: 'Para Piyasası Şemsiye Fonu' },
  { value: 'Borçlanma Araçları Şemsiye Fonu', label: 'Borçlanma Araçları Şemsiye Fonu' },
  { value: 'Fon Sepeti Şemsiye Fonu', label: 'Fon Sepeti Şemsiye Fonu' },
  { value: 'Katılım Şemsiye Fonu', label: 'Katılım Şemsiye Fonu' },
  { value: 'Kıymetli Madenler Şemsiye Fonu', label: 'Kıymetli Madenler Şemsiye Fonu' },
] as const;

type UmbrellaFilter = (typeof UMBRELLA_FILTER_OPTIONS)[number]['value'];
type ReturnSortMode = 'highest' | 'lowest' | null;

const RETURN_SORT_KEYS = new Set<keyof FundTableReturns>(['m1', 'm3', 'm6', 'ytd', 'y1', 'y3', 'y5']);
type AdvancedSortMode =
  | 'default'
  | 'investor_count'
  | 'investor_growth_1m'
  | 'portfolio_value'
  | 'defensive';

const ADVANCED_SORT_OPTIONS: { value: AdvancedSortMode; label: string }[] = [
  { value: 'default', label: 'Varsayılan' },
  { value: 'investor_count', label: 'En Çok Yatırımcısı Olanlar' },
  { value: 'investor_growth_1m', label: 'Yatırımcısı En Hızlı Artanlar (Son 1 Ay)' },
  { value: 'portfolio_value', label: 'En Büyük Fonlar' },
  { value: 'defensive', label: 'En Defansif Fonlar (Kriz Kalkanı)' },
];

const MAX_COMPARE_FUNDS = 4;

const FILTER_CONTROL_H = 'h-[42px]';
const FILTER_SELECT_CLS = `w-full ${FILTER_CONTROL_H} rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100`;
const FILTER_BTN_BASE = `inline-flex ${FILTER_CONTROL_H} w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm font-semibold shadow-sm transition sm:px-3`;

function matchesUmbrellaFilter(fund: FundTableRow, filter: UmbrellaFilter): boolean {
  if (filter === 'all') return true;
  return fund.umbrella_type === filter;
}

const FILTER_META: Record<TaxFilter, { label: string; cls: string }> = {
  all: { label: 'Tümü', cls: 'bg-white/20 text-white' },
  free: { label: 'Vergisiz', cls: 'bg-emerald-500/90 text-white' },
  taxed: { label: 'Vergili', cls: 'bg-slate-500/90 text-white' },
};

function formatPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatPortfolioValue(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Milyar ₺`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Milyon ₺`;
  }
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
}

function formatInvestorCount(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} katılımcı`;
}

function metricSortValue(fund: FundTableRow, mode: AdvancedSortMode): number | null {
  if (mode === 'default' || mode === 'defensive') return null;
  return fund.metrics[mode];
}

function defensiveScore(fund: FundTableRow): number | null {
  const nm = fund.metrics.negative_months;
  const vol = fund.metrics.volatility;
  if (nm == null && vol == null) return null;
  return (nm ?? 12) * 1000 + (vol ?? 1);
}

function compareMetricDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function compareMetricAsc(a: number | null, b: number | null): number {
  return -compareMetricDesc(a, b);
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconArrowUp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04L10.75 5.612V16.25A.75.75 0 0110 17z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconArrowDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v10.638l4.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l4.96 4.158V3.75A.75.75 0 0110 3z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function PerformanceCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-slate-400">—</span>;
  }
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-xs font-medium sm:text-sm ${
        positive ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      {positive ? (
        <IconArrowUp className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <IconArrowDown className="h-3.5 w-3.5 shrink-0" />
      )}
      {formatPct(value)}
    </span>
  );
}

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 3.568a1 1 0 011.374 0l2.25 2.25a1 1 0 00.95.276l3.182.455a1 1 0 01.554 1.705l-2.303 2.244a1 1 0 00-.287.885l.544 3.168a1 1 0 01-1.451 1.054L10 13.347l-2.85 1.498a1 1 0 01-1.451-1.054l.544-3.168a1 1 0 00-.287-.885L3.653 8.249a1 1 0 01.554-1.705l3.182-.455a1 1 0 00.95-.276l2.25-2.25z"
      />
    </svg>
  );
}

function FundCodeBadge({ code }: { code: string }) {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-sm">
      {code}
    </span>
  );
}

interface Props {
  onSelectFund?: (fund: FundTableRow) => void;
  onFavoriteChange?: () => void | Promise<void>;
}

export default function SecuritiesFundsTable({ onSelectFund, onFavoriteChange }: Props) {
  const [rows, setRows] = useState<FundTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imposterCount, setImposterCount] = useState(0);

  const [search, setSearch] = useState('');
  const [umbrellaFilter, setUmbrellaFilter] = useState<UmbrellaFilter>('all');
  const [titleTypeFilter, setTitleTypeFilter] = useState<FundTitleTypeFilter>('all');
  const [returnSortMode, setReturnSortMode] = useState<ReturnSortMode>(null);
  const [advancedSort, setAdvancedSort] = useState<AdvancedSortMode>('default');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [taxFilter, setTaxFilter] = useState<TaxFilter>('all');
  const [togglingFavorite, setTogglingFavorite] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('fund_code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const loadOverview = (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    return getFundOverview(refresh)
      .then((res) => {
        setRows(res.rows);
        setImposterCount(res.meta.dbOnlyCodes.length);
        if (refresh) {
          toast.success('TEFAS\'tan canlı güncelleme tamamlandı.');
        }
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : 'Fon tablosu yüklenemedi.';
        if (!refresh || rows.length === 0) {
          setError(message);
        }
        toast.error(
          refresh
            ? 'TEFAS güncellemesi başarısız; yerel veriler gösteriliyor.'
            : message
        );
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const taxMeta = FILTER_META[taxFilter];
  const nextTaxFilter =
    taxFilter === 'all' ? 'Vergisiz' : taxFilter === 'free' ? 'Vergili' : 'Tümü';

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    let list = rows;

    if (taxFilter === 'free') list = list.filter((f) => f.is_tax_free === 1);
    if (taxFilter === 'taxed') list = list.filter((f) => f.is_tax_free === 0);
    if (showOnlyFavorites) list = list.filter((f) => f.is_favorite);
    if (umbrellaFilter !== 'all') {
      list = list.filter((f) => matchesUmbrellaFilter(f, umbrellaFilter));
    }
    if (titleTypeFilter !== 'all') {
      list = list.filter((f) => f.title_type === titleTypeFilter);
    }

    if (q) {
      list = list.filter(
        (f) =>
          f.fund_code.toLocaleLowerCase('tr-TR').includes(q) ||
          f.fund_name.toLocaleLowerCase('tr-TR').includes(q) ||
          f.umbrella_type.toLocaleLowerCase('tr-TR').includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (advancedSort === 'defensive') {
        const metricCmp = compareMetricAsc(defensiveScore(a), defensiveScore(b));
        if (metricCmp !== 0) return metricCmp;
        return a.fund_code.localeCompare(b.fund_code, 'tr-TR');
      }
      if (advancedSort !== 'default') {
        const metricCmp = compareMetricDesc(
          metricSortValue(a, advancedSort),
          metricSortValue(b, advancedSort)
        );
        if (metricCmp !== 0) return metricCmp;
        return a.fund_code.localeCompare(b.fund_code, 'tr-TR');
      }

      let av: string | number | null;
      let bv: string | number | null;

      if (sortKey === 'fund_code' || sortKey === 'fund_name' || sortKey === 'umbrella_type') {
        av = a[sortKey];
        bv = b[sortKey];
      } else {
        av = a.returns[sortKey];
        bv = b.returns[sortKey];
      }

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv, 'tr-TR');
        return sortDir === 'asc' ? cmp : -cmp;
      }

      const cmp = Number(av) - Number(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, umbrellaFilter, titleTypeFilter, showOnlyFavorites, taxFilter, sortKey, sortDir, advancedSort]);

  const favoriteCount = useMemo(() => rows.filter((f) => f.is_favorite).length, [rows]);

  const toggleFavorite = async (fund: FundTableRow) => {
    if (togglingFavorite) return;
    const code = fund.fund_code;
    const next = !fund.is_favorite;
    setTogglingFavorite(code);
    setRows((prev) =>
      prev.map((r) => (r.fund_code === code ? { ...r, is_favorite: next } : r))
    );
    try {
      if (next) await addToWatchlist(code);
      else await removeFromWatchlist(code);
      patchFundOverviewFavorite(code, next);
      void onFavoriteChange?.();
      toast.success(
        next ? `${code} izleme listesine eklendi.` : `${code} izleme listesinden çıkarıldı.`
      );
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.fund_code === code ? { ...r, is_favorite: !next } : r))
      );
      toast.error('İzleme listesi güncellenemedi.');
    } finally {
      setTogglingFavorite(null);
    }
  };

  const selectedFunds = useMemo(
    () => rows.filter((f) => selected.has(f.fund_code)),
    [rows, selected]
  );

  const toggleSort = (key: SortKey) => {
    setAdvancedSort('default');
    setReturnSortMode(null);
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key.startsWith('y') || key === 'm1' ? 'desc' : 'asc');
    }
  };

  const activeReturnSortKey = (): keyof FundTableReturns =>
    RETURN_SORT_KEYS.has(sortKey as keyof FundTableReturns)
      ? (sortKey as keyof FundTableReturns)
      : 'm1';

  const sortByPeriodReturn = (mode: 'highest' | 'lowest') => {
    setAdvancedSort('default');
    setReturnSortMode(mode);
    setSortKey(activeReturnSortKey());
    setSortDir(mode === 'highest' ? 'desc' : 'asc');
  };

  const handleAdvancedSortChange = (mode: AdvancedSortMode) => {
    setAdvancedSort(mode);
    if (mode !== 'default') {
      setReturnSortMode(null);
      setSortKey('fund_code');
      setSortDir('asc');
    }
  };

  const hasActiveFilters =
    umbrellaFilter !== 'all' ||
    titleTypeFilter !== 'all' ||
    advancedSort !== 'default' ||
    returnSortMode != null ||
    search.trim() !== '' ||
    showOnlyFavorites ||
    taxFilter !== 'all' ||
    sortKey !== 'fund_code' ||
    sortDir !== 'asc' ||
    selected.size > 0;

  const resetFilters = () => {
    setUmbrellaFilter('all');
    setTitleTypeFilter('all');
    setAdvancedSort('default');
    setReturnSortMode(null);
    setSearch('');
    setShowOnlyFavorites(false);
    setTaxFilter('all');
    setSortKey('fund_code');
    setSortDir('asc');
    setSelected(new Set());
    setCompareOpen(false);
  };

  const toggleRow = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else if (next.size >= MAX_COMPARE_FUNDS) {
        toast.error(`En fazla ${MAX_COMPARE_FUNDS} fon seçebilirsiniz.`);
        return prev;
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleCompare = () => {
    if (selectedFunds.length < 2) {
      toast.error('Karşılaştırma için en az 2 fon seçin.');
      return;
    }
    setCompareOpen(true);
  };

  const cycleTaxFilter = () =>
    setTaxFilter((prev) => (prev === 'all' ? 'free' : prev === 'free' ? 'taxed' : 'all'));

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? (
      <IconArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <IconArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  if (loading && rows.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-slate-500">
        TEFAS fon tablosu yükleniyor…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
          <p className="mt-2 text-rose-600/80">
            İnternet bağlantınızı kontrol edin. Tablo verileri TEFAS&apos;tan canlı çekilir.
          </p>
          <button
            type="button"
            onClick={() => void loadOverview(true)}
            className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            Yeniden dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-[1600px] px-4 py-6 ${selected.size > 0 ? 'pb-28' : 'pb-6'}`}>
      <ViewHeader
        title="Fonlar (Ana Sayfa)"
        subtitle="TEFAS resmi liste — filtreleme, karşılaştırma ve izleme listesi."
        popoutView="funds"
      />
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {filtered.length.toLocaleString('tr-TR')}
            </span>{' '}
            fon gösteriliyor
            {filtered.length !== rows.length && (
              <span className="text-slate-500">
                {' '}
                / {rows.length.toLocaleString('tr-TR')} (TEFAS resmi liste)
              </span>
            )}
            {filtered.length === rows.length && (
              <span className="text-slate-500"> (TEFAS resmi liste)</span>
            )}
            {imposterCount > 0 && (
              <span className="ml-2 text-xs text-amber-600">
                · {imposterCount} yerel kayıt listede yok (hariç tutuldu)
              </span>
            )}
          </p>
          <div className="flex w-full flex-col gap-2 sm:max-w-2xl sm:flex-row sm:items-center sm:ml-auto">
            <button
              type="button"
              onClick={() => void loadOverview(true)}
              disabled={refreshing}
              title="TEFAS'tan canlı fiyat ve getiri güncellemesi"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconRefresh className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Yenileniyor…' : 'Yenile'}
            </button>
            <button
              type="button"
              onClick={() => setShowOnlyFavorites((v) => !v)}
              className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                showOnlyFavorites
                  ? 'border-amber-300 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/50'
              }`}
            >
              <StarIcon filled={showOnlyFavorites} className="h-4 w-4" />
              Favorilerim
              {favoriteCount > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  {favoriteCount}
                </span>
              )}
            </button>
            <div className="relative min-w-0 flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Aradığınız fonun kodunu veya adını yazınız"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-slate-500">Şemsiye Fon Türü</label>
            <select
              value={umbrellaFilter}
              onChange={(e) => setUmbrellaFilter(e.target.value as UmbrellaFilter)}
              className={FILTER_SELECT_CLS}
            >
              {UMBRELLA_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-slate-500">Fon Unvan Türü</label>
            <select
              value={titleTypeFilter}
              onChange={(e) => setTitleTypeFilter(e.target.value as FundTitleTypeFilter)}
              className={`${FILTER_SELECT_CLS} ${
                titleTypeFilter !== 'all'
                  ? 'border-sky-300 bg-sky-50/60 focus:border-sky-500 focus:ring-sky-100'
                  : ''
              }`}
            >
              {FUND_TITLE_TYPE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Gelişmiş Sıralama</label>
            <select
              value={advancedSort}
              onChange={(e) => handleAdvancedSortChange(e.target.value as AdvancedSortMode)}
              className={`${FILTER_SELECT_CLS} ${
                advancedSort !== 'default'
                  ? 'border-violet-300 bg-violet-50/60 focus:border-violet-500 focus:ring-violet-100'
                  : ''
              }`}
            >
              {ADVANCED_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-w-0">
          <label className="mb-1 block text-xs font-medium text-slate-500">Getiri Sıralaması</label>
          <div className="grid max-w-xl grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => sortByPeriodReturn('highest')}
                className={`${FILTER_BTN_BASE} ${
                  returnSortMode === 'highest'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50'
                }`}
              >
                En Yüksek
              </button>
              <button
                type="button"
                onClick={() => sortByPeriodReturn('lowest')}
                className={`${FILTER_BTN_BASE} ${
                  returnSortMode === 'lowest'
                    ? 'border-rose-300 bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50/50'
                }`}
              >
                En Düşük
              </button>
              <button
                type="button"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                title="Tüm filtreleri sıfırla"
                className={`${FILTER_BTN_BASE} disabled:cursor-not-allowed disabled:opacity-50 ${
                  hasActiveFilters
                    ? 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                Sıfırla
              </button>
            </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[calc(100vh-17rem)] min-h-[280px] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-white">
                <th className={`${TH_STICKY} w-10 px-3 py-3 text-center`}>
                  <span className="sr-only">Seç</span>
                </th>
                <th className={`${TH_STICKY} w-10 px-2 py-3 text-center`}>
                  <span className="sr-only">İzleme Listesi</span>
                  <StarIcon filled className="mx-auto h-4 w-4 text-amber-300" />
                </th>
                <th className={`${TH_STICKY} min-w-[88px] px-3 py-3 align-top`}>
                  <button
                    type="button"
                    onClick={cycleTaxFilter}
                    title={`Filtre: ${taxMeta.label} — tıklayın (sıradaki: ${nextTaxFilter})`}
                    className="group flex flex-col items-start gap-1 rounded-md text-left transition hover:text-blue-100"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-100">
                      Vergi Durumu
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal ${taxMeta.cls}`}
                    >
                      {taxMeta.label}
                    </span>
                  </button>
                </th>
                <th className={`${TH_STICKY} whitespace-nowrap px-3 py-3`}>
                  <button
                    type="button"
                    onClick={() => toggleSort('fund_code')}
                    className="hover:text-blue-200"
                  >
                    Fon Kodu
                    <SortIcon col="fund_code" />
                  </button>
                </th>
                <th className={`${TH_STICKY} min-w-[200px] px-3 py-3`}>
                  <button
                    type="button"
                    onClick={() => toggleSort('fund_name')}
                    className="hover:text-blue-200"
                  >
                    Fon Adı
                    <SortIcon col="fund_name" />
                  </button>
                </th>
                <th className={`${TH_STICKY} min-w-[180px] px-3 py-3`}>
                  <button
                    type="button"
                    onClick={() => toggleSort('umbrella_type')}
                    className="hover:text-blue-200"
                  >
                    Şemsiye Fon Türü
                    <SortIcon col="umbrella_type" />
                  </button>
                </th>
                {RETURN_COLUMNS.map((col) => (
                  <th key={col.key} className={`${TH_STICKY} whitespace-nowrap px-3 py-3 text-right`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="hover:text-blue-200"
                    >
                      {col.label}
                      <SortIcon col={col.key} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center text-slate-500">
                    Arama kriterlerine uygun fon bulunamadı.
                  </td>
                </tr>
              )}
              {filtered.map((fund) => {
                const isSelected = selected.has(fund.fund_code);
                const dot = umbrellaDotColor(fund.umbrella_type);
                return (
                  <tr
                    key={fund.fund_code}
                    className={`transition hover:bg-slate-50 ${isSelected ? 'bg-blue-50/40' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(fund.fund_code)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`${fund.fund_code} seç`}
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(fund)}
                        disabled={togglingFavorite === fund.fund_code}
                        title={fund.is_favorite ? 'İzleme listesinden çıkar' : 'İzleme listesine ekle'}
                        className={`rounded-md p-1 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50 ${
                          fund.is_favorite ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'
                        }`}
                        aria-label={fund.is_favorite ? `${fund.fund_code} favorilerden çıkar` : `${fund.fund_code} favorilere ekle`}
                      >
                        <StarIcon filled={fund.is_favorite} className="h-5 w-5" />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <TaxBadge isTaxFree={fund.is_tax_free === 1} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectFund?.(fund)}
                        className="rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                      >
                        <FundCodeBadge code={fund.fund_code} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-left text-xs leading-snug text-slate-700">
                      <button
                        type="button"
                        onClick={() => onSelectFund?.(fund)}
                        className="text-left text-xs leading-snug hover:text-blue-700 hover:underline"
                      >
                        {fund.fund_name}
                      </button>
                      {advancedSort === 'investor_count' && (
                        <p className="mt-0.5 text-[11px] font-medium text-violet-600">
                          {formatInvestorCount(fund.metrics.investor_count)}
                        </p>
                      )}
                      {advancedSort === 'investor_growth_1m' && (
                        <p
                          className={`mt-0.5 text-[11px] font-medium ${
                            fund.metrics.investor_growth_1m == null
                              ? 'text-slate-400'
                              : fund.metrics.investor_growth_1m > 0
                                ? 'text-emerald-600'
                                : fund.metrics.investor_growth_1m < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                          }`}
                        >
                          {fund.metrics.investor_growth_1m == null
                            ? '1 ay verisi yok'
                            : `${fund.metrics.investor_growth_1m > 0 ? '+' : ''}${fund.metrics.investor_growth_1m.toLocaleString('tr-TR')} yatırımcı (1 ay)`}
                        </p>
                      )}
                      {advancedSort === 'portfolio_value' && (
                        <p className="mt-0.5 text-[11px] font-medium text-violet-600">
                          {formatPortfolioValue(fund.metrics.portfolio_value)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2 text-slate-600">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                        <span className="text-xs sm:text-sm">{fund.umbrella_type}</span>
                      </span>
                    </td>
                    {RETURN_COLUMNS.map((col) => (
                      <td key={col.key} className="px-3 py-3 text-right">
                        <PerformanceCell value={fund.returns[col.key]} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-blue-200 bg-blue-50/95 px-4 py-3 shadow-[0_-4px_20px_rgba(30,58,138,0.12)] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-blue-900">Karşılaştırma Listem</span>
              {selectedFunds.map((f) => (
                <span
                  key={f.fund_code}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-bold text-white"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {f.fund_code}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCompare}
              disabled={selectedFunds.length < 2}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M1 4.25A3.25 3.25 0 014.25 1h8.5A3.25 3.25 0 0116 4.25v5.5A3.25 3.25 0 0112.75 13h-7.5A3.25 3.25 0 012 9.75v-5.5zM4.25 2.5a1.75 1.75 0 00-1.75 1.75v5.5c0 .966.784 1.75 1.75 1.75h7.5a1.75 1.75 0 001.75-1.75v-5.5A1.75 1.75 0 0011.75 2.5h-7.5z" />
                <path d="M6 10.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zM3.75 15.5a.75.75 0 000 1.5h12.5a.75.75 0 000-1.5H3.75z" />
              </svg>
              Karşılaştır ({selectedFunds.length}/{MAX_COMPARE_FUNDS})
            </button>
          </div>
        </div>
      )}

      {compareOpen && (
        <FundCompareModal
          funds={selectedFunds}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}
