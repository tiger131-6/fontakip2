import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import type {
  DividendEntry,
  Fund,
  GoldPriceQuote,
  PortfolioHistoryEntry,
  PortfolioHolding,
  PortfolioResponse,
  PortfolioSummary,
} from '../types';
import ViewHeader from './ViewHeader';
import FundSearchSelect from './FundSearchSelect';
import {
  addPortfolioEntry,
  addDividend,
  deleteDividend,
  deletePortfolioEntry,
  getDividends,
  getGoldPrice,
  getPortfolio,
  getPortfolioHistory,
  clearPortfolioHistory,
  deletePortfolioHistoryEntry,
} from '../api';

const GOLD_FUND_CODE = 'ALTIN';

function isGoldHolding(h: PortfolioHolding): boolean {
  return h.fund_code === GOLD_FUND_CODE || h.is_gold === true;
}

function applyGoldQuoteToHolding(h: PortfolioHolding, buyPrice: number, fetchedAt: string): PortfolioHolding {
  const totalCost = h.buy_price * h.quantity;
  const currentValue = buyPrice * h.quantity;
  const profitAndLoss = currentValue - totalCost;
  const profitAndLossPct = totalCost > 0 ? (profitAndLoss / totalCost) * 100 : null;
  const previous = h.previous_day_price;
  const dailyChangePct =
    previous != null && previous > 0 ? ((buyPrice / previous - 1) * 100) : h.daily_change_pct ?? null;
  return {
    ...h,
    latest_price: buyPrice,
    latest_price_date: fetchedAt.slice(0, 10),
    daily_change_pct: dailyChangePct,
    currentValue,
    profitAndLoss,
    profitAndLossPct,
  };
}

function recalcPortfolioSummary(holdings: PortfolioHolding[], quote: GoldPriceQuote): PortfolioSummary {
  let totalCost = 0;
  let currentValue = 0;
  let hasAnyPrice = false;

  for (const h of holdings) {
    totalCost += h.totalCost;
    if (h.currentValue != null) {
      currentValue += h.currentValue;
      hasAnyPrice = true;
    }
  }

  const profitAndLoss = hasAnyPrice ? currentValue - totalCost : 0;
  const profitAndLossPct =
    hasAnyPrice && totalCost > 0 ? (profitAndLoss / totalCost) * 100 : null;

  return {
    totalCost,
    currentValue: hasAnyPrice ? currentValue : 0,
    profitAndLoss: hasAnyPrice ? profitAndLoss : 0,
    profitAndLossPct,
    gold_price: quote.buyPrice,
    gold_buy_price: quote.buyPrice,
    gold_sell_price: quote.sellPrice,
    gold_price_fetched_at: quote.fetchedAt,
  };
}

function applyGoldQuoteToPortfolio(prev: PortfolioResponse, quote: GoldPriceQuote): PortfolioResponse {
  const holdings = prev.holdings.map((h) =>
    isGoldHolding(h) ? applyGoldQuoteToHolding(h, quote.buyPrice, quote.fetchedAt) : h
  );
  return {
    holdings,
    summary: recalcPortfolioSummary(holdings, quote),
  };
}

type AssetEntryMode = 'fund' | 'gold';
type PortfolioTab = 'holdings' | 'history' | 'dividends';
type HoldingsView = 'table' | 'heatmap';

interface Props {
  funds: Fund[];
}

function sliceLabel(code: string): string {
  return code === GOLD_FUND_CODE ? 'Gram Altın' : code;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatPct(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function holdingDailyPnl(h: PortfolioHolding): number | null {
  if (h.latest_price == null || h.currentValue == null) return null;

  if (h.previous_day_price != null && h.previous_day_price > 0) {
    return h.quantity * (h.latest_price - h.previous_day_price);
  }

  if (h.daily_change_pct != null && Number.isFinite(h.daily_change_pct)) {
    return h.currentValue - h.currentValue / (1 + h.daily_change_pct / 100);
  }

  return null;
}

interface PortfolioMetrics {
  totalPrincipal: number;
  currentBalance: number;
  netPnl: number;
  netPnlPct: number | null;
  dailyPnl: number | null;
}

/** Core P&L metrics for any subset of holdings (respects checkbox filtering upstream). */
function computePortfolioMetrics(items: PortfolioHolding[]): PortfolioMetrics {
  if (items.length === 0) {
    return {
      totalPrincipal: 0,
      currentBalance: 0,
      netPnl: 0,
      netPnlPct: null,
      dailyPnl: 0,
    };
  }

  let totalPrincipal = 0;
  let currentBalance = 0;
  let dailyPnl = 0;
  let hasDaily = false;

  for (const h of items) {
    totalPrincipal += h.quantity * h.buy_price;
    if (h.latest_price != null) {
      currentBalance += h.quantity * h.latest_price;
    }
    const dayPnl = holdingDailyPnl(h);
    if (dayPnl != null) {
      dailyPnl += dayPnl;
      hasDaily = true;
    }
  }

  const netPnl = currentBalance - totalPrincipal;
  const netPnlPct = totalPrincipal > 0 ? (netPnl / totalPrincipal) * 100 : null;

  return {
    totalPrincipal,
    currentBalance,
    netPnl,
    netPnlPct,
    dailyPnl: hasDaily ? dailyPnl : null,
  };
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

interface HeatmapBlock {
  code: string;
  label: string;
  value: number;
  weight: number;
  pnlPct: number;
  span: number;
}

interface RebalanceAsset {
  code: string;
  label: string;
  currentValue: number;
  currentPct: number;
  latestPrice: number;
  quantity: number;
}

interface RebalanceOrder {
  code: string;
  label: string;
  side: 'buy' | 'sell';
  isGold: boolean;
  actualShares: number;
  actualDifferenceTL: number;
}

function isGoldAsset(code: string): boolean {
  return code === GOLD_FUND_CODE;
}

function roundRebalanceShares(code: string, exactShares: number): number {
  if (isGoldAsset(code)) {
    return Math.round(exactShares * 100) / 100;
  }
  return Math.round(exactShares);
}

function formatOrderQuantity(code: string, shares: number): string {
  const abs = Math.abs(shares);
  if (isGoldAsset(code)) {
    return `${abs.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Gram`;
  }
  return `${Math.round(abs).toLocaleString('tr-TR')} Adet`;
}

function buildRebalanceAssets(holdings: PortfolioHolding[]): RebalanceAsset[] {
  const byCode = new Map<
    string,
    { value: number; quantity: number; latestPrice: number | null; name: string }
  >();

  for (const h of holdings) {
    const prev = byCode.get(h.fund_code) ?? {
      value: 0,
      quantity: 0,
      latestPrice: h.latest_price,
      name: h.fund_name ?? h.fund_code,
    };
    prev.quantity += h.quantity;
    if (h.latest_price != null) {
      prev.value += h.quantity * h.latest_price;
      prev.latestPrice = h.latest_price;
    }
    byCode.set(h.fund_code, prev);
  }

  const total = [...byCode.values()].reduce((s, v) => s + v.value, 0);

  return [...byCode.entries()]
    .filter(([, v]) => v.value > 0 && v.latestPrice != null && v.latestPrice > 0)
    .map(([code, v]) => ({
      code,
      label: sliceLabel(code),
      currentValue: v.value,
      currentPct: total > 0 ? (v.value / total) * 100 : 0,
      latestPrice: v.latestPrice!,
      quantity: v.quantity,
    }))
    .sort((a, b) => b.currentValue - a.currentValue);
}

function targetsSumTo100(total: number): boolean {
  return Math.abs(total - 100) < 0.01;
}

function pnlToHeatColor(pct: number): string {
  if (pct > 15) return 'bg-emerald-700';
  if (pct > 5) return 'bg-emerald-500';
  if (pct > 0) return 'bg-emerald-400';
  if (pct === 0) return 'bg-slate-400';
  if (pct > -5) return 'bg-rose-400';
  if (pct > -15) return 'bg-rose-500';
  return 'bg-rose-700';
}

function buildHeatmapBlocks(holdings: PortfolioHolding[]): HeatmapBlock[] {
  const map = new Map<string, { value: number; cost: number }>();
  for (const h of holdings) {
    const prev = map.get(h.fund_code) ?? { value: 0, cost: 0 };
    prev.cost += h.totalCost;
    if (h.currentValue != null) prev.value += h.currentValue;
    map.set(h.fund_code, prev);
  }
  const total = [...map.values()].reduce((s, v) => s + v.value, 0);
  return [...map.entries()]
    .filter(([, v]) => v.value > 0)
    .map(([code, v]) => {
      const weight = total > 0 ? v.value / total : 0;
      const pnlPct = v.cost > 0 ? ((v.value - v.cost) / v.cost) * 100 : 0;
      return {
        code,
        label: code === GOLD_FUND_CODE ? 'Gram Altın' : code,
        value: v.value,
        weight,
        pnlPct,
        span: Math.max(2, Math.round(weight * 12)),
      };
    })
    .sort((a, b) => b.value - a.value);
}

function generateAiInsights(holdings: PortfolioHolding[]): string[] {
  if (holdings.length === 0) {
    return ['Portföyünüzde henüz varlık bulunmuyor. Çeşitlendirme analizi için önce alım ekleyin.'];
  }

  const byCode = new Map<string, { value: number; cost: number; isGold: boolean }>();
  for (const h of holdings) {
    const prev = byCode.get(h.fund_code) ?? { value: 0, cost: 0, isGold: h.fund_code === GOLD_FUND_CODE };
    prev.cost += h.totalCost;
    if (h.currentValue != null) prev.value += h.currentValue;
    byCode.set(h.fund_code, prev);
  }

  const totalValue = [...byCode.values()].reduce((s, v) => s + v.value, 0);
  const totalCost = [...byCode.values()].reduce((s, v) => s + v.cost, 0);
  if (totalValue <= 0) {
    return ['Güncel fiyat verisi olmadığı için ağırlık analizi yapılamıyor. Fiyat senkronizasyonunu kontrol edin.'];
  }

  let goldValue = 0;
  let equityValue = 0;
  let otherValue = 0;
  const lines: string[] = [];

  for (const [code, v] of byCode) {
    if (v.isGold) goldValue += v.value;
    else if (code.length <= 5) equityValue += v.value;
    else otherValue += v.value;
  }

  const goldPct = (goldValue / totalValue) * 100;
  const equityPct = (equityValue / totalValue) * 100;
  const top = [...byCode.entries()].sort((a, b) => b[1].value - a[1].value)[0];
  const topPct = top ? (top[1].value / totalValue) * 100 : 0;

  lines.push(
    `Portföyünüz ${byCode.size} farklı varlıktan oluşuyor; toplam güncel değer ${formatMoney(totalValue)} ₺.`
  );

  if (equityPct >= 60) {
    lines.push(
      `Portföy ağırlıklı olarak yatırım fonlarına (%${formatPct(equityPct)}) yönelmiş durumda. Yüksek beta riski taşıyabilir.`
    );
  } else if (equityPct >= 35) {
    lines.push(
      `Fon ağırlığınız %${formatPct(equityPct)} seviyesinde — dengeli ama hâlâ büyüme odaklı bir profil.`
    );
  } else {
    lines.push('Fon ağırlığınız düşük; portföy defansif veya alternatif varlıklara kaymış görünüyor.');
  }

  if (goldPct >= 20) {
    lines.push(
      `Gram altın payı %${formatPct(goldPct)}. Enflasyon/kriz korunmasına önem veren bir yapı — likidite ve fırsat maliyetini izleyin.`
    );
  } else if (goldPct > 0) {
    lines.push(`Altın hedge payı %${formatPct(goldPct)} — makul bir koruma katmanı.`);
  } else {
    lines.push('Altın pozisyonu yok. Makro belirsizlik dönemlerinde küçük bir hedge eklenebilir.');
  }

  if (topPct >= 45) {
    lines.push(
      `Konsantrasyon uyarısı: ${top[0]} tek başına portföyün %${formatPct(topPct)}'ini oluşturuyor. Çeşitlendirme önerilir.`
    );
  } else {
    lines.push(`En büyük pozisyon (${top?.[0] ?? '—'}) %${formatPct(topPct)} ağırlıkta — kabul edilebilir konsantrasyon.`);
  }

  const netPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  if (netPct > 10) {
    lines.push(`Toplam portföy getirisi %${formatPct(netPct)} ile pozitif. Kâr realizasyonu ve yeniden dengeleme zamanlamasını değerlendirin.`);
  } else if (netPct < -5) {
    lines.push(`Portföy %${formatPct(Math.abs(netPct))} zararda. Defansif fonlara veya altına rotasyon stratejisi düşünülebilir.`);
  } else {
    lines.push('Portföy performansı nötr bantta. Uzun vadeli plana sadık kalın.');
  }

  return lines;
}

function PnlCell({ amount, pct }: { amount: number | null; pct: number | null }) {
  if (amount == null) {
    return <span className="font-mono text-slate-400">-</span>;
  }
  const positive = amount > 0;
  const negative = amount < 0;
  const color = positive ? 'text-emerald-600' : negative ? 'text-red-600' : 'text-slate-500';
  const sign = positive ? '+' : '';
  return (
    <div className={`font-mono text-xs font-medium tabular-nums ${color}`}>
      <div className="whitespace-nowrap">
        {sign}
        {formatMoney(amount)} ₺
      </div>
      {pct != null && (
        <div className="whitespace-nowrap text-[10px] opacity-90">
          {sign}
          {formatPct(pct)}%
        </div>
      )}
    </div>
  );
}

function GoldCoinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 00-1.5 0v2.19l-.72-.72a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l2-2a.75.75 0 10-1.06-1.06l-.72.72V6.5zM7 11.25a.75.75 0 000 1.5h6a.75.75 0 000-1.5H7z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SignedPnlValue({
  amount,
  pct,
  muted = false,
}: {
  amount: number;
  pct?: number | null;
  muted?: boolean;
}) {
  const positive = amount > 0;
  const negative = amount < 0;
  const color = muted
    ? positive
      ? 'text-emerald-300'
      : negative
        ? 'text-rose-300'
        : 'text-slate-300'
    : positive
      ? 'text-emerald-600'
      : negative
        ? 'text-red-600'
        : 'text-slate-500';
  const arrow = positive ? '▲' : negative ? '▼' : '';
  const sign = positive ? '+' : '';

  return (
    <div className={`font-mono text-xs font-semibold tabular-nums ${color}`}>
      <span>
        {arrow && `${arrow} `}
        {sign}
        {formatMoney(amount)} ₺
      </span>
      {pct != null && (
        <span className={`ml-1.5 text-xs font-medium ${muted ? 'opacity-80' : 'opacity-90'}`}>
          ({sign}
          {formatPct(pct)}%)
        </span>
      )}
    </div>
  );
}

function SummaryStatRow({
  label,
  children,
  muted = false,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 border-b py-2 last:border-b-0 ${
        muted ? 'border-slate-700' : 'border-slate-100'
      }`}
    >
      <span
        className={`text-[10px] font-semibold uppercase tracking-wide ${
          muted ? 'text-slate-400' : 'text-slate-500'
        }`}
      >
        {label}
      </span>
      <div className="text-right">{children}</div>
    </div>
  );
}

function SummaryColumnCard({
  title,
  metrics,
  variant = 'default',
}: {
  title: string;
  metrics: PortfolioMetrics;
  variant?: 'default' | 'gold' | 'total';
}) {
  const isTotal = variant === 'total';
  const isGold = variant === 'gold';
  const muted = isTotal;

  const shellClass = isTotal
    ? 'border-2 border-indigo-300 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg ring-1 ring-indigo-500/20'
    : isGold
      ? 'border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white shadow-sm'
      : 'border border-slate-200 bg-white shadow-sm';

  const headerClass = isTotal
    ? 'text-indigo-200'
    : isGold
      ? 'text-amber-800'
      : 'text-indigo-700';

  const moneyClass = isTotal
    ? 'font-mono text-xs font-bold tabular-nums text-white'
    : 'font-mono text-xs font-bold tabular-nums text-slate-800';

  return (
    <div className={`rounded-lg p-3.5 ${shellClass}`}>
      <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${headerClass}`}>{title}</div>
      <div className="mt-2">
        <SummaryStatRow label="Toplam Ana Para" muted={muted}>
          <span className={moneyClass}>{formatMoney(metrics.totalPrincipal)} ₺</span>
        </SummaryStatRow>
        <SummaryStatRow label="Güncel Bakiye" muted={muted}>
          <span className={moneyClass}>{formatMoney(metrics.currentBalance)} ₺</span>
        </SummaryStatRow>
        <SummaryStatRow label="Net Kâr/Zarar" muted={muted}>
          <SignedPnlValue amount={metrics.netPnl} pct={metrics.netPnlPct} muted={muted} />
        </SummaryStatRow>
        <SummaryStatRow label="Günlük Getiri" muted={muted}>
          {metrics.dailyPnl != null ? (
            <SignedPnlValue amount={metrics.dailyPnl} muted={muted} />
          ) : (
            <span className={`font-mono text-xs tabular-nums ${muted ? 'text-slate-400' : 'text-slate-400'}`}>
              —
            </span>
          )}
        </SummaryStatRow>
      </div>
    </div>
  );
}

function TransactionBadge({ type }: { type: PortfolioHistoryEntry['transaction_type'] }) {
  if (type === 'BUY') {
    return (
      <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
        ALIM
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 ring-1 ring-inset ring-rose-200">
      SATIM
    </span>
  );
}

function RealizedPnlCell({ entry }: { entry: PortfolioHistoryEntry }) {
  if (entry.transaction_type === 'BUY') {
    return <span className="font-mono text-sm text-slate-400">-</span>;
  }
  const pnl = entry.realized_pnl;
  const positive = pnl > 0;
  const negative = pnl < 0;
  const color = positive ? 'text-emerald-600' : negative ? 'text-red-600' : 'text-slate-500';
  const sign = positive ? '+' : '';
  return (
    <span className={`font-mono text-sm font-medium tabular-nums ${color}`}>
      {sign}
      {formatMoney(pnl)} ₺
    </span>
  );
}

export default function Portfolio({ funds }: Props) {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [history, setHistory] = useState<PortfolioHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<PortfolioTab>('holdings');
  const [holdingsView, setHoldingsView] = useState<HoldingsView>('table');
  const [showAiInsights, setShowAiInsights] = useState(false);
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [dividendsLoading, setDividendsLoading] = useState(false);
  const [divFundCode, setDivFundCode] = useState('');
  const [divAmount, setDivAmount] = useState('');
  const [divDate, setDivDate] = useState(todayIso());
  const [divSubmitting, setDivSubmitting] = useState(false);
  const [deletingDividendId, setDeletingDividendId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [entryMode, setEntryMode] = useState<AssetEntryMode>('fund');
  const [fundCode, setFundCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyDate, setBuyDate] = useState(todayIso());
  const [liveGoldBuy, setLiveGoldBuy] = useState<number | null>(null);
  const [liveGoldSell, setLiveGoldSell] = useState<number | null>(null);
  const [goldPriceLoading, setGoldPriceLoading] = useState(false);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const [targetAllocations, setTargetAllocations] = useState<Record<string, number>>({});
  const [rebalanceOrders, setRebalanceOrders] = useState<RebalanceOrder[]>([]);
  const [selectedAssetCodes, setSelectedAssetCodes] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getPortfolio());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Portföy yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await getPortfolioHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem geçmişi yüklenemedi.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadDividends = useCallback(async () => {
    setDividendsLoading(true);
    try {
      setDividends(await getDividends());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Temettüler yüklenemedi.');
    } finally {
      setDividendsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    void loadHistory();
  }, [activeTab, loadHistory]);

  useEffect(() => {
    if (activeTab !== 'dividends') return;
    void loadDividends();
  }, [activeTab, loadDividends]);

  const refreshLiveGoldPrice = useCallback(async (force = false) => {
    setGoldPriceLoading(true);
    try {
      const q = await getGoldPrice(force);
      setLiveGoldBuy(q.buyPrice);
      setLiveGoldSell(q.sellPrice);

      if (force) {
        let portfolioUpdated = false;
        setData((prev) => {
          if (!prev || !prev.holdings.some(isGoldHolding)) return prev;
          portfolioUpdated = true;
          return applyGoldQuoteToPortfolio(prev, q);
        });
        if (portfolioUpdated) {
          toast.success('Altın fiyatları çekildi ve portföy güncellendi.');
        }
      }
    } catch {
      const fallbackBuy = liveGoldBuy ?? data?.summary.gold_buy_price ?? null;
      const fallbackSell = liveGoldSell ?? data?.summary.gold_sell_price ?? null;
      if (fallbackBuy != null) {
        setLiveGoldBuy(fallbackBuy);
        setLiveGoldSell(fallbackSell);
        toast.error('Güncel veri alınamadı, son bilinen fiyatlar gösteriliyor.');
      } else {
        toast.error('Güncel veri alınamadı, son bilinen fiyatlar gösteriliyor.');
      }
    } finally {
      setGoldPriceLoading(false);
    }
  }, [data?.summary.gold_buy_price, data?.summary.gold_sell_price, liveGoldBuy, liveGoldSell]);

  useEffect(() => {
    if (entryMode !== 'gold') return;
    void refreshLiveGoldPrice(false);
  }, [entryMode, refreshLiveGoldPrice]);

  const holdings = data?.holdings ?? [];

  useEffect(() => {
    const codes = [...new Set(holdings.map((h) => h.fund_code))];
    if (codes.length === 0) {
      setSelectedAssetCodes([]);
      return;
    }
    setSelectedAssetCodes((prev) => {
      if (prev.length === 0) return codes;
      const next = new Set(prev.filter((code) => codes.includes(code)));
      for (const code of codes) next.add(code);
      return [...next];
    });
  }, [holdings]);

  const handleToggleAsset = useCallback((code: string) => {
    setSelectedAssetCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  const selectedItems = useMemo(
    () => holdings.filter((h) => selectedAssetCodes.includes(h.fund_code)),
    [holdings, selectedAssetCodes]
  );

  const fundItems = useMemo(
    () => selectedItems.filter((h) => !isGoldHolding(h)),
    [selectedItems]
  );

  const goldItems = useMemo(
    () => selectedItems.filter((h) => isGoldHolding(h)),
    [selectedItems]
  );

  const fundMetrics = useMemo(() => computePortfolioMetrics(fundItems), [fundItems]);
  const goldMetrics = useMemo(() => computePortfolioMetrics(goldItems), [goldItems]);
  const totalMetrics = useMemo(() => computePortfolioMetrics(selectedItems), [selectedItems]);

  const currentBalance = totalMetrics.currentBalance;
  const heatmapBlocks = useMemo(() => buildHeatmapBlocks(selectedItems), [selectedItems]);
  const aiInsightLines = useMemo(() => generateAiInsights(holdings), [holdings]);
  const dividendTotal = useMemo(
    () => dividends.reduce((s, d) => s + d.amount_tl, 0),
    [dividends]
  );

  const rebalanceAssets = useMemo(() => buildRebalanceAssets(holdings), [holdings]);

  const totalTargetPercentage = useMemo(
    () =>
      Object.values(targetAllocations).reduce((sum, value) => sum + (Number(value) || 0), 0),
    [targetAllocations]
  );

  const targetsValid = targetsSumTo100(totalTargetPercentage);

  const openRebalanceWizard = () => {
    const initial: Record<string, number> = {};
    for (const asset of rebalanceAssets) {
      initial[asset.code] = Math.round(asset.currentPct * 100) / 100;
    }
    setTargetAllocations(initial);
    setRebalanceOrders([]);
    setRebalanceOpen(true);
  };

  const handleTargetChange = (code: string, raw: string) => {
    const parsed = raw === '' ? 0 : Number(raw);
    setTargetAllocations((prev) => ({
      ...prev,
      [code]: Number.isFinite(parsed) ? parsed : 0,
    }));
    setRebalanceOrders([]);
  };

  const handleCalculateRebalance = () => {
    if (!targetsValid) {
      toast.error(`Toplam hedef %100 olmalıdır. Şu an: %${formatPct(totalTargetPercentage)}`);
      return;
    }
    if (rebalanceAssets.length === 0 || currentBalance <= 0) {
      toast.error('Rebalans için güncel fiyatlı varlık bulunamadı.');
      return;
    }

    const orders: RebalanceOrder[] = rebalanceAssets
      .map((asset) => {
        const targetPct = targetAllocations[asset.code] ?? 0;
        const targetValue = currentBalance * (targetPct / 100);
        const differenceTL = targetValue - asset.currentValue;
        const exactShares = differenceTL / asset.latestPrice;
        const actualShares = roundRebalanceShares(asset.code, exactShares);
        const actualDifferenceTL = actualShares * asset.latestPrice;
        return {
          code: asset.code,
          label: asset.label,
          side: differenceTL >= 0 ? ('buy' as const) : ('sell' as const),
          isGold: isGoldAsset(asset.code),
          actualShares,
          actualDifferenceTL,
        };
      })
      .filter((order) => order.actualShares !== 0);

    setRebalanceOrders(orders);
    toast.success('Emir listesi başarıyla oluşturuldu!');
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const portfolio = await addPortfolioEntry({
        fund_code: entryMode === 'gold' ? GOLD_FUND_CODE : fundCode.trim().toUpperCase(),
        buy_date: buyDate,
        buy_price: Number(buyPrice),
        quantity: Number(quantity),
      });
      setData(portfolio);
      await loadHistory();
      setQuantity('');
      setBuyPrice('');
      toast.success('Varlık başarıyla portföye eklendi!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alım eklenemedi.');
      toast.error('Eklenirken bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddDividend = async (e: FormEvent) => {
    e.preventDefault();
    setDivSubmitting(true);
    setError(null);
    try {
      await addDividend({
        fund_code: divFundCode.trim().toUpperCase(),
        amount_tl: Number(divAmount),
        date: divDate,
      });
      await loadDividends();
      setDivAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Temettü eklenemedi.');
    } finally {
      setDivSubmitting(false);
    }
  };

  const handleDeleteDividend = async (id: number) => {
    setDeletingDividendId(id);
    try {
      await deleteDividend(id);
      await loadDividends();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Temettü silinemedi.');
    } finally {
      setDeletingDividendId(null);
    }
  };

  const handleDeleteHistoryEntry = async (entry: PortfolioHistoryEntry) => {
    const label =
      entry.transaction_type === 'BUY'
        ? `${entry.fund_code} alım kaydı`
        : `${entry.fund_code} satım kaydı`;
    if (!window.confirm(`"${label}" işlem geçmişinden silinsin mi? Mevcut varlıklarınız etkilenmez.`)) {
      return;
    }
    setDeletingHistoryId(entry.id);
    setError(null);
    try {
      setHistory(await deletePortfolioHistoryEntry(entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt silinemedi.');
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const handleClearHistory = async () => {
    if (
      !window.confirm(
        'Tüm işlem geçmişi kalıcı olarak silinecek. Mevcut varlıklarınız etkilenmez. Devam etmek istiyor musunuz?'
      )
    ) {
      return;
    }
    setClearingHistory(true);
    setError(null);
    try {
      await clearPortfolioHistory();
      setHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem geçmişi temizlenemedi.');
    } finally {
      setClearingHistory(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !window.confirm(
        'Bu varlığı satarak portföyden çıkarmak istediğinize emin misiniz? İşlem geçmişine kaydedilecektir.'
      )
    ) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      setData(await deletePortfolioEntry(id));
      await loadHistory();
      toast.success('Varlık satıldı ve işlem geçmişine işlendi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt silinemedi.');
      toast.error('Satış işlemi sırasında bir hata oluştu.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <ViewHeader
        title="Portföy"
        subtitle="Alım kayıtlarınız ve güncel kar/zarar durumu (fonlar: TEFAS, gram altın: Yapı Kredi)."
        popoutView="portfolio"
        actions={
          <button
            type="button"
            onClick={() => setShowAiInsights((v) => !v)}
            className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 shadow-sm transition hover:bg-violet-100"
          >
            AI Portföy Analizi
          </button>
        }
      />

      {showAiInsights && (
        <div className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-violet-900">AI Portföy Analizi</h3>
          <p className="mt-1 text-xs text-violet-700/80">Yapılandırılmış çeşitlendirme değerlendirmesi (yerel hesaplama)</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
            {aiInsightLines.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-violet-500">▸</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-center text-slate-400">Portföy yükleniyor…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('holdings')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'holdings'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Mevcut Varlıklarım
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'history'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              İşlem Geçmişi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dividends')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'dividends'
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Temettü Gelirleri
            </button>
          </div>

          {activeTab === 'holdings' && (
            <>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Mevcut Varlıklarım</h3>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setHoldingsView('table')}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                    holdingsView === 'table'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Tablo
                </button>
                <button
                  type="button"
                  onClick={() => setHoldingsView('heatmap')}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                    holdingsView === 'heatmap'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Isı Haritası
                </button>
              </div>
            </div>
            {holdings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                Henüz portföy kaydı yok. Aşağıdan ilk alımınızı ekleyin.
              </div>
            ) : holdingsView === 'heatmap' ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-12 gap-2 auto-rows-[minmax(88px,auto)]">
                  {heatmapBlocks.map((block) => (
                    <div
                      key={block.code}
                      className={`${pnlToHeatColor(block.pnlPct)} flex min-h-[88px] flex-col justify-between rounded-xl p-3 text-white shadow-sm transition hover:brightness-110`}
                      style={{ gridColumn: `span ${Math.min(block.span, 12)}` }}
                      title={`${block.label}: ${formatMoney(block.value)} ₺`}
                    >
                      <div className="text-xs font-bold uppercase tracking-wide opacity-90">
                        {block.label}
                      </div>
                      <div className="text-lg font-bold tabular-nums">{formatMoney(block.value)} ₺</div>
                      <div className="text-[11px] opacity-90">
                        %{formatPct(block.weight * 100)} · {block.pnlPct >= 0 ? '+' : ''}
                        {formatPct(block.pnlPct)}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Kutu boyutu portföy ağırlığını, renk güncel getiriyi gösterir (yeşil: kâr, kırmızı: zarar).
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="w-10 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <span className="sr-only">Dahil</span>
                        <svg className="mx-auto h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM7.75 9.25a.75.75 0 011.06 0L9.5 10.94l2.69-2.69a.75.75 0 111.06 1.06l-3.22 3.22a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 010-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Fon Kodu
                      </th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Adet
                      </th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Ort. Maliyet
                      </th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Güncel Fiyat
                      </th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Toplam Değer
                      </th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Kar/Zarar
                      </th>
                      <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Sil
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {holdings.map((h: PortfolioHolding) => (
                      <tr
                        key={h.id}
                        className={`hover:bg-slate-50 ${
                          selectedAssetCodes.includes(h.fund_code) ? '' : 'opacity-50'
                        }`}
                      >
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedAssetCodes.includes(h.fund_code)}
                            onChange={() => handleToggleAsset(h.fund_code)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            aria-label={`${h.fund_code} özet hesaplamaya dahil et`}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {h.fund_code === GOLD_FUND_CODE || h.is_gold ? (
                            <div className="flex items-start gap-2">
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                                <GoldCoinIcon className="h-3 w-3" />
                                ALTIN
                              </span>
                              <div>
                                <div className="text-xs font-semibold text-amber-900">Gram Altın</div>
                                <div className="text-[10px] text-slate-400">{longDate(h.buy_date)}</div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="font-mono text-xs font-bold text-indigo-700">{h.fund_code}</div>
                              {h.fund_name && (
                                <div className="max-w-xs truncate text-[10px] text-slate-500">{h.fund_name}</div>
                              )}
                              <div className="text-[10px] text-slate-400">{longDate(h.buy_date)}</div>
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs tabular-nums">
                          {formatMoney(h.quantity)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-700">
                          {formatMoney(h.buy_price)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-700">
                          {h.latest_price != null ? formatMoney(h.latest_price) : '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs font-medium tabular-nums text-slate-800">
                          {h.currentValue != null ? `${formatMoney(h.currentValue)} ₺` : '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <PnlCell amount={h.profitAndLoss} pct={h.profitAndLossPct} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDelete(h.id)}
                            disabled={deletingId === h.id}
                            title="Sil"
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          >
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                              <path
                                fillRule="evenodd"
                                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.06 1.06L8.94 10l-1.42 1.22a.75.75 0 101 1.06l1.42-1.22 1.42 1.22a.75.75 0 101-1.06l-1.42-1.22 1.42-1.22a.75.75 0 00-1.06-1.06L10 8.94 8.58 7.72z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-800">Görsel Özet</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Tablodaki onay kutularına göre seçili varlıklar — fon, altın ve toplam karşılaştırması.
                  </p>
                </div>
                {selectedAssetCodes.length === 0 && (
                  <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                    Özet için en az bir varlık seçin
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <SummaryColumnCard title="FON" metrics={fundMetrics} />
                <SummaryColumnCard title="ALTIN" metrics={goldMetrics} variant="gold" />
                <SummaryColumnCard title="TOPLAM" metrics={totalMetrics} variant="total" />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Alım Ekle</h3>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setEntryMode('fund')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    entryMode === 'fund'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Fon Ekle
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('gold')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    entryMode === 'gold'
                      ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Altın Ekle
                </button>
              </div>
            </div>

            <form onSubmit={handleAdd} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {entryMode === 'fund' ? (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Fon Kodu</label>
                  <FundSearchSelect
                    funds={funds}
                    value={fundCode}
                    onChange={setFundCode}
                    excludeCodes={[GOLD_FUND_CODE]}
                    allowEmpty
                    emptyLabel="Fon seçin…"
                    required
                  />
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Varlık</label>
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <GoldCoinIcon className="h-5 w-5 text-amber-600" />
                    <div>
                      <div className="text-sm font-semibold text-amber-900">Gram Altın</div>
                      <div className="text-xs text-amber-700/80">
                        Kod: {GOLD_FUND_CODE}
                        {goldPriceLoading ? (
                          <span> · Yapı Kredi fiyatları yükleniyor…</span>
                        ) : (
                          <>
                            {(liveGoldBuy ?? data?.summary.gold_buy_price) != null && (
                              <span>
                                {' '}
                                · Alış (portföy):{' '}
                                {formatMoney(liveGoldBuy ?? data?.summary.gold_buy_price ?? 0)} ₺/gr
                              </span>
                            )}
                            {(liveGoldSell ?? data?.summary.gold_sell_price) != null && (
                              <span>
                                {' '}
                                · Satış (yeni alım):{' '}
                                {formatMoney(liveGoldSell ?? data?.summary.gold_sell_price ?? 0)} ₺/gr
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {entryMode === 'gold' ? 'Gram' : 'Adet'}
                </label>
                <input
                  type="number"
                  required
                  min="0.0001"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="1000"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Alış Fiyatı</label>
                <input
                  type="number"
                  required
                  min="0.0001"
                  step="any"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="1.2345"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Alım Tarihi</label>
                <input
                  type="date"
                  required
                  value={buyDate}
                  onChange={(e) => setBuyDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Ekleniyor…' : 'Alım Ekle'}
                </button>
                {entryMode === 'gold' && (
                  <button
                    type="button"
                    onClick={() => void refreshLiveGoldPrice(true)}
                    disabled={goldPriceLoading || submitting}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {goldPriceLoading ? 'Yenileniyor…' : 'Yenile'}
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Rebalans Sihirbazı</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Hedef ağırlıkları belirleyin; sistem gerekli AL/SAT emirlerini hesaplar.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={openRebalanceWizard}
                  disabled={rebalanceAssets.length === 0}
                  className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Sihirbazı Aç
                </button>
                {rebalanceOpen && (
                  <button
                    type="button"
                    onClick={() => setRebalanceOpen(false)}
                    className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
                  >
                    Sihirbazı Kapat
                  </button>
                )}
              </div>
            </div>

            {rebalanceOpen && (
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-lg">
                <div className="border-b border-slate-700 px-5 py-4">
                  <h4 className="text-base font-bold text-white">Otomatik Portföy Dengeleme</h4>
                </div>

                {rebalanceAssets.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-slate-400">
                    Güncel fiyat verisi olan varlık bulunamadı.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            <th className="px-5 py-3">Varlık</th>
                            <th className="px-3 py-3 text-right">Mevcut Ağırlık</th>
                            <th className="px-3 py-3 text-right">Güncel Değer</th>
                            <th className="px-5 py-3 text-right">Hedef %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rebalanceAssets.map((asset) => (
                            <tr key={asset.code} className="border-b border-slate-800/80">
                              <td className="px-5 py-3">
                                <div className="font-mono font-bold text-white">{asset.code}</div>
                                <div className="text-xs text-slate-500">{asset.label}</div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-300">
                                %{formatPct(asset.currentPct)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-300">
                                {formatMoney(asset.currentValue)} ₺
                              </td>
                              <td className="px-5 py-3 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={targetAllocations[asset.code] ?? ''}
                                  onChange={(e) => handleTargetChange(asset.code, e.target.value)}
                                  className="w-24 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-right font-mono text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 px-5 py-4">
                      <div className="flex items-center gap-3">
                        {targetsValid ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
                            Toplam hedef: %{formatPct(totalTargetPercentage)} ✓
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-400 ring-1 ring-inset ring-rose-500/30">
                            Toplam hedef %100 olmalıdır. Şu an: %{formatPct(totalTargetPercentage)}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          Portföy: {formatMoney(currentBalance)} ₺
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCalculateRebalance}
                        disabled={!targetsValid}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                      >
                        Hesapla
                      </button>
                    </div>

                    {rebalanceOrders.length > 0 && (
                      <div className="border-t border-slate-700 bg-slate-950/60 px-5 py-4">
                        <h4 className="mb-3 text-sm font-bold text-white">Emir Sihirbazı</h4>
                        <div className="overflow-x-auto rounded-xl border border-slate-700">
                          <table className="w-full min-w-[520px] border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-slate-700 bg-slate-800/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                <th className="px-4 py-2.5">İşlem</th>
                                <th className="px-4 py-2.5">Fon</th>
                                <th className="px-4 py-2.5 text-right">Adet</th>
                                <th className="px-4 py-2.5 text-right">Tutar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rebalanceOrders.map((order) => (
                                <tr key={order.code} className="border-b border-slate-800/80">
                                  <td className="px-4 py-2.5">
                                    {order.side === 'buy' ? (
                                      <span className="inline-flex rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/40">
                                        AL
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-md bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-400 ring-1 ring-inset ring-rose-500/40">
                                        SAT
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 font-mono font-bold text-white">
                                    {order.code}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-200">
                                    {formatOrderQuantity(order.code, order.actualShares)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-200">
                                    {formatMoney(Math.abs(order.actualDifferenceTL))} ₺
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">
                          Not: Yatırım fonları piyasada tam pay (adet) olarak işlem gördüğü için yuvarlama
                          yapılmıştır. Bu nedenle toplam AL ve SAT tutarları kuruşu kuruşuna denk olmayabilir,
                          aradaki küçük farklar vadesiz hesabınızda kalır.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
            </>
          )}

          {activeTab === 'history' && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-800">İşlem Geçmişi</h3>
                <button
                  type="button"
                  onClick={() => void handleClearHistory()}
                  disabled={clearingHistory || historyLoading || history.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.06 1.06L8.94 10l-1.42 1.22a.75.75 0 101 1.06l1.42-1.22 1.42 1.22a.75.75 0 101-1.06l-1.42-1.22 1.42-1.22a.75.75 0 00-1.06-1.06L10 8.94 8.58 7.72z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {clearingHistory ? 'Temizleniyor…' : 'Geçmişi Temizle'}
                </button>
              </div>
              {historyLoading ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-400">
                  İşlem geçmişi yükleniyor…
                </p>
              ) : history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                  Henüz arşivlenmiş işlem yok. Alım veya satım işlemleri burada görünecektir.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          İşlem Tipi
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Fon / Varlık Kodu
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Tarih
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                          İşlem Fiyatı
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Adet
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Gerçekleşen Kar/Zarar
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Sil
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <TransactionBadge type={entry.transaction_type} />
                          </td>
                          <td className="px-3 py-2">
                            {entry.fund_code === GOLD_FUND_CODE ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                                  <GoldCoinIcon className="h-3.5 w-3.5" />
                                  ALTIN
                                </span>
                                <span className="text-xs text-slate-500">Gram Altın</span>
                              </div>
                            ) : (
                              <span className="font-mono text-sm font-bold text-indigo-700">
                                {entry.fund_code}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {longDate(entry.transaction_date)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-700">
                            {formatMoney(entry.price)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-700">
                            {formatMoney(entry.quantity)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <RealizedPnlCell entry={entry} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => void handleDeleteHistoryEntry(entry)}
                              disabled={deletingHistoryId === entry.id}
                              title="Kaydı sil"
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            >
                              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                <path
                                  fillRule="evenodd"
                                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.06 1.06L8.94 10l-1.42 1.22a.75.75 0 101 1.06l1.42-1.22 1.42 1.22a.75.75 0 101-1.06l-1.42-1.22 1.42-1.22a.75.75 0 00-1.06-1.06L10 8.94 8.58 7.72z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'dividends' && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-800">Temettü Gelirleri</h3>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
                  <span className="text-emerald-700">Toplam Pasif Gelir: </span>
                  <span className="font-bold tabular-nums text-emerald-900">
                    {formatMoney(dividendTotal)} ₺
                  </span>
                </div>
              </div>

              <form
                onSubmit={handleAddDividend}
                className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4"
              >
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Fon Kodu</label>
                  <FundSearchSelect
                    funds={funds}
                    value={divFundCode}
                    onChange={setDivFundCode}
                    allowEmpty
                    emptyLabel="Fon seçin…"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Tutar (₺)</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    value={divAmount}
                    onChange={(e) => setDivAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Tarih</label>
                  <input
                    type="date"
                    required
                    value={divDate}
                    onChange={(e) => setDivDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-4">
                  <button
                    type="submit"
                    disabled={divSubmitting}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {divSubmitting ? 'Kaydediliyor…' : 'Temettü Ekle'}
                  </button>
                </div>
              </form>

              {dividendsLoading ? (
                <p className="text-center text-sm text-slate-400">Temettüler yükleniyor…</p>
              ) : dividends.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                  Henüz temettü kaydı yok.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Fon</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Tarih</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Tutar</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-500">Sil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dividends.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-sm font-bold text-indigo-700">{d.fund_code}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{longDate(d.date)}</td>
                          <td className="px-4 py-3 text-right font-mono text-sm font-medium text-emerald-700">
                            +{formatMoney(d.amount_tl)} ₺
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => void handleDeleteDividend(d.id)}
                              disabled={deletingDividendId === d.id}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            >
                              Sil
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
