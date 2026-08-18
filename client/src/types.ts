export interface Fund {
  fund_code: string;
  fund_name: string;
  is_tax_free: 0 | 1;
  is_active: 0 | 1;
  is_favorite: boolean;
}

/** Tax-status filter for the fund table. */
export type TaxFilter = 'all' | 'free' | 'taxed';

export interface PricePoint {
  id: number;
  fund_code: string;
  price_date: string; // YYYY-MM-DD
  price: number;
  portfolio_value?: number | null;
  total_pay_value?: number | null;
  total_shares?: number | null;
  investor_count?: number | null;
  active_value?: number | null;
  occupancy_rate?: number | null;
}

export interface HistoryResponse {
  fund: Fund;
  history: PricePoint[];
}

export interface RefreshResponse extends HistoryResponse {
  latest: { date: string; price: number; name: string };
  message: string;
}

export interface BackfillResponse extends HistoryResponse {
  inserted: number;
  message: string;
}

/** SSE 'progress' payload from GET /api/seed/start. */
export interface SyncProgress {
  current: number;
  total: number;
  status: 'processing' | 'warn' | 'done' | 'stopped';
  currentRange?: string;
  kind?: string;
  inserted: number;
  fundsWithData: number;
  message?: string;
}

export interface FonbulMetricRow {
  id: number;
  fund_code: string;
  price_date: string;
  price: number;
  portfolio_value: number | null;
  total_pay_value: number | null;
  total_shares: number | null;
  investor_count: number | null;
  active_value: number | null;
  occupancy_rate: number | null;
}

export interface FonbulStats {
  totalRows: number;
  rowsWithMetrics: number;
  fundCount: number;
  minDate: string | null;
  maxDate: string | null;
}

export type HeatmapTag = 'yellow' | 'blue' | 'red';

export interface HeatmapCell {
  pct: number;
  price: number;
  prevDate: string;
  prevPrice: number;
  tag: HeatmapTag;
}

export interface FonbulHeatmapSummary {
  yellow: number;
  red: number;
  blue: number;
  generalTotal: number;
  last15: number;
  first15: number;
}

export interface TechnicalScreenerPricePoint {
  date: string;
  price: number;
}

export interface TechnicalScreenerSeries {
  fund_code: string;
  prices: TechnicalScreenerPricePoint[];
}

export interface TechnicalScreenerResponse {
  days: number;
  rangeStart: string;
  rangeEnd: string;
  series: TechnicalScreenerSeries[];
}

export interface FonbulHeatmapPricePoint {
  date: string;
  price: number;
}

export interface FonbulHeatmapResponse {
  rangeStart: string;
  rangeEnd: string;
  rangeLabel: string;
  dates: string[];
  fundCodes: string[];
  rows: Array<{
    date: string;
    cells: Array<HeatmapCell | null>;
  }>;
  summary: FonbulHeatmapSummary[];
  fundPrices: FonbulHeatmapPricePoint[][];
}

export interface FonbulMetricsResponse {
  fund_code: string;
  fund_name: string;
  rows: FonbulMetricRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  fundMinDate: string | null;
  fundMaxDate: string | null;
  filterStart: string | null;
  filterEnd: string | null;
}

/** SSE 'progress' payload from GET /api/fonbul/scrape-all. */
export interface FonbulScrapeProgress {
  current: number;
  total: number;
  currentFund: string;
  status: 'scraping' | 'warn' | 'done' | 'stopped';
  inserted: number;
  message?: string;
}

/** SSE 'done' payload from GET /api/fonbul/scrape-all. */
export interface FonbulScrapeResult {
  completed: boolean;
  stopped: boolean;
  inserted: number;
  fundsWithData: number;
  total: number;
  current: number;
}

/** SSE 'done' payload from GET /api/seed/start. */
export interface SyncResult {
  completed: boolean;
  stopped: boolean;
  inserted: number;
  fundsWithData: number;
  total: number;
  current: number;
  startDate: string;
  /** Present on GET /api/sync/recent combined TEFAS + FonBul run. */
  tefasInserted?: number;
  fonbulInserted?: number;
  fonbulFundsWithData?: number;
  range?: string;
  label?: string;
}

/** GET /api/funds/check response — TEFAS vs local DB reconciliation. */
export interface AddedFund {
  code: string;
  name: string;
  isTaxFree: boolean;
}
export interface MissingFund {
  code: string;
  name: string;
}
export interface FundListDiff {
  added: AddedFund[];
  missing: MissingFund[];
  tefasCount: number;
  dbCount: number;
}

/** POST /api/funds/apply response. */
export interface ApplyResult {
  added: number;
  deactivated: number;
  reactivated: number;
  tefasCount: number;
  message: string;
}

export interface PortfolioHolding {
  id: number;
  fund_code: string;
  fund_name: string | null;
  buy_date: string;
  buy_price: number;
  quantity: number;
  latest_price: number | null;
  latest_price_date: string | null;
  previous_day_price?: number | null;
  daily_change_pct?: number | null;
  totalCost: number;
  currentValue: number | null;
  profitAndLoss: number | null;
  profitAndLossPct: number | null;
  is_gold?: boolean;
}

export interface PortfolioSummary {
  totalCost: number;
  currentValue: number;
  profitAndLoss: number;
  profitAndLossPct: number | null;
  gold_price?: number | null;
  gold_buy_price?: number | null;
  gold_sell_price?: number | null;
  gold_price_fetched_at?: string | null;
}

export interface BackupFundRow {
  fund_code: string;
  fund_name: string;
  is_tax_free: number;
  is_active: number;
}

export interface BackupPriceRow {
  id: number;
  fund_code: string;
  price_date: string;
  price: number;
}

export interface BackupPortfolioRow {
  id: number;
  fund_code: string;
  buy_date: string;
  buy_price: number;
  quantity: number;
}

export interface BackupWatchlistRow {
  fund_code: string;
}

export interface BackupPayload {
  funds: BackupFundRow[];
  price_history: BackupPriceRow[];
  portfolio: BackupPortfolioRow[];
  watchlist: BackupWatchlistRow[];
}

export interface BackupImportResult {
  message: string;
  counts: {
    funds: number;
    price_history: number;
    portfolio: number;
    watchlist: number;
  };
}

export interface GoldPriceQuote {
  buyPrice: number;
  sellPrice: number;
  price: number;
  currency: 'TRY';
  unit: 'gram';
  source: 'yapikredi';
  label: string;
  fetchedAt: string;
  cached: boolean;
}

export interface PortfolioResponse {
  summary: PortfolioSummary;
  holdings: PortfolioHolding[];
}

export interface AddPortfolioInput {
  fund_code: string;
  buy_date: string;
  buy_price: number;
  quantity: number;
}

export interface PortfolioHistoryEntry {
  id: number;
  fund_code: string;
  transaction_type: 'BUY' | 'SELL';
  transaction_date: string;
  price: number;
  quantity: number;
  realized_pnl: number;
}

export interface FundTableReturns {
  m1: number | null;
  m3: number | null;
  m6: number | null;
  ytd: number | null;
  y1: number | null;
  y3: number | null;
  y5: number | null;
}

export interface FundMetrics {
  investor_count: number | null;
  portfolio_value: number | null;
  investor_growth_1m: number | null;
  negative_months: number | null;
  volatility: number | null;
}

export interface DividendEntry {
  id: number;
  fund_code: string;
  amount_tl: number;
  date: string;
}

export interface PriceAlert {
  id: number;
  fund_code: string;
  target_price: number;
  condition: 'ABOVE' | 'BELOW';
  is_active: number;
}

export interface FundCagrResult {
  fund_code: string;
  cagr: number | null;
  cagr_pct: number | null;
  years: number;
  start_date: string | null;
  end_date: string | null;
  data_points: number;
}

export interface FundTableRow {
  fund_code: string;
  fund_name: string;
  is_tax_free: 0 | 1;
  is_active: 0 | 1;
  is_favorite: boolean;
  umbrella_type: string;
  title_type: string;
  metrics: FundMetrics;
  returns: FundTableReturns;
}

export interface FundOverviewResponse {
  rows: FundTableRow[];
  meta: {
    tefasCount: number;
    dbCount: number;
    rowCount: number;
    dbOnlyCodes: string[];
    tefasOnlyCodes: string[];
  };
  cached: boolean;
  fetchedAt: string;
}
