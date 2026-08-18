import db, { type PortfolioHistoryRow, type PortfolioRow } from './db';
import { GOLD_FUND_CODE, fetchGramGoldPrice, getCachedGramGoldPrice, getLastKnownGramGoldPrice, getPreviousGoldBuyPrice } from './gold-price';
import { todayIso } from './trading-lookback';

const stmtListPortfolio = db.prepare(`
  WITH portfolio_codes AS (
    SELECT DISTINCT fund_code FROM portfolio
  ),
  ranked AS (
    SELECT
      ph.fund_code,
      ph.price,
      ph.price_date,
      ROW_NUMBER() OVER (PARTITION BY ph.fund_code ORDER BY ph.price_date DESC) AS rn
    FROM price_history ph
    INNER JOIN portfolio_codes pc ON pc.fund_code = ph.fund_code
    WHERE ph.price IS NOT NULL AND ph.price > 0
  )
  SELECT
    p.id,
    p.fund_code,
    p.buy_date,
    p.buy_price,
    p.quantity,
    f.fund_name,
    l1.price AS latest_price,
    l1.price_date AS latest_price_date,
    l2.price AS previous_day_price
  FROM portfolio p
  LEFT JOIN funds f ON f.fund_code = p.fund_code
  LEFT JOIN ranked l1 ON l1.fund_code = p.fund_code AND l1.rn = 1
  LEFT JOIN ranked l2 ON l2.fund_code = p.fund_code AND l2.rn = 2
  ORDER BY p.id DESC
`);

const stmtInsertPortfolio = db.prepare(
  'INSERT INTO portfolio (fund_code, buy_date, buy_price, quantity) VALUES (?, ?, ?, ?)'
);

const stmtInsertHistory = db.prepare(`
  INSERT INTO portfolio_history (fund_code, transaction_type, transaction_date, price, quantity, realized_pnl)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const stmtGetPortfolioById = db.prepare(
  'SELECT id, fund_code, buy_date, buy_price, quantity FROM portfolio WHERE id = ?'
);

const stmtLatestPrice = db.prepare(`
  SELECT price FROM price_history WHERE fund_code = ? ORDER BY price_date DESC LIMIT 1
`);

const stmtDeletePortfolio = db.prepare('DELETE FROM portfolio WHERE id = ?');

const stmtListHistory = db.prepare(`
  SELECT id, fund_code, transaction_type, transaction_date, price, quantity, realized_pnl
  FROM portfolio_history
  ORDER BY transaction_date DESC, id DESC
`);

const stmtClearHistory = db.prepare('DELETE FROM portfolio_history');

const stmtDeleteHistoryEntry = db.prepare('DELETE FROM portfolio_history WHERE id = ?');

interface PortfolioRowEnriched extends PortfolioRow {
  fund_name: string | null;
  latest_price: number | null;
  latest_price_date: string | null;
  previous_day_price: number | null;
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
  previous_day_price: number | null;
  daily_change_pct: number | null;
  totalCost: number;
  currentValue: number | null;
  profitAndLoss: number | null;
  profitAndLossPct: number | null;
  is_gold: boolean;
}

export interface PortfolioSummary {
  totalCost: number;
  currentValue: number;
  profitAndLoss: number;
  profitAndLossPct: number | null;
  /** Yapı Kredi alış — used for portfolio valuation. */
  gold_price: number | null;
  gold_buy_price: number | null;
  gold_sell_price: number | null;
  gold_price_fetched_at: string | null;
}

export interface PortfolioResponse {
  summary: PortfolioSummary;
  holdings: PortfolioHolding[];
}

interface GoldPriceContext {
  buyPrice: number | null;
  sellPrice: number | null;
  fetchedAt: string | null;
  previousBuyPrice: number | null;
}

async function resolveLatestPrice(fundCode: string): Promise<number | null> {
  if (fundCode === GOLD_FUND_CODE) {
    try {
      const quote = await fetchGramGoldPrice({ forceRefresh: false });
      return quote.buyPrice;
    } catch {
      return getLastKnownGramGoldPrice()?.buyPrice ?? null;
    }
  }

  const row = stmtLatestPrice.get(fundCode) as { price: number } | undefined;
  return row?.price ?? null;
}

function enrich(row: PortfolioRowEnriched, gold: GoldPriceContext): PortfolioHolding {
  const isGold = row.fund_code === GOLD_FUND_CODE;
  const totalCost = row.buy_price * row.quantity;

  let latest: number | null = row.latest_price;
  let latestDate: string | null = row.latest_price_date;
  let previous: number | null = row.previous_day_price;
  let fundName = row.fund_name;

  if (isGold) {
    if (gold.buyPrice != null && Number.isFinite(gold.buyPrice) && gold.buyPrice > 0) {
      latest = gold.buyPrice;
      latestDate = gold.fetchedAt ? gold.fetchedAt.slice(0, 10) : row.latest_price_date;
    }
    fundName = fundName ?? 'Gram Altın';
    previous = gold.previousBuyPrice ?? row.previous_day_price;
  }

  const hasPrice = latest != null && Number.isFinite(latest) && latest > 0;
  const dailyChangePct =
    hasPrice &&
    previous != null &&
    Number.isFinite(previous) &&
    previous > 0 &&
    latest != null
      ? ((latest / previous - 1) * 100)
      : null;
  const currentValue = hasPrice && latest != null ? latest * row.quantity : null;
  const profitAndLoss =
    currentValue != null && Number.isFinite(currentValue) ? currentValue - totalCost : null;
  const profitAndLossPct =
    profitAndLoss != null && totalCost > 0 ? (profitAndLoss / totalCost) * 100 : null;

  return {
    id: row.id,
    fund_code: row.fund_code,
    fund_name: fundName,
    buy_date: row.buy_date,
    buy_price: row.buy_price,
    quantity: row.quantity,
    latest_price: hasPrice ? latest : null,
    latest_price_date: latestDate,
    previous_day_price:
      previous != null && Number.isFinite(previous) && previous > 0 ? previous : null,
    daily_change_pct: dailyChangePct,
    totalCost,
    currentValue,
    profitAndLoss,
    profitAndLossPct,
    is_gold: isGold,
  };
}

function resolveGoldPrice(rows: PortfolioRowEnriched[]): GoldPriceContext {
  const hasGold = rows.some((r) => r.fund_code === GOLD_FUND_CODE);
  if (!hasGold) {
    return { buyPrice: null, sellPrice: null, fetchedAt: null, previousBuyPrice: null };
  }

  const goldRow = rows.find((r) => r.fund_code === GOLD_FUND_CODE);
  const cached = getCachedGramGoldPrice() ?? getLastKnownGramGoldPrice();

  // Refresh live gold in the background — never block portfolio on bank network I/O.
  void fetchGramGoldPrice({ forceRefresh: false }).catch(() => {});

  if (cached) {
    const today = cached.fetchedAt.slice(0, 10);
    return {
      buyPrice: cached.buyPrice,
      sellPrice: cached.sellPrice,
      fetchedAt: cached.fetchedAt,
      previousBuyPrice: getPreviousGoldBuyPrice(today),
    };
  }

  const dbPrice = goldRow?.latest_price;
  if (dbPrice != null && Number.isFinite(dbPrice) && dbPrice > 0) {
    const priceDate = goldRow?.latest_price_date ?? todayIso();
    return {
      buyPrice: dbPrice,
      sellPrice: dbPrice,
      fetchedAt: `${priceDate}T12:00:00.000Z`,
      previousBuyPrice: getPreviousGoldBuyPrice(priceDate) ?? goldRow?.previous_day_price ?? null,
    };
  }

  console.warn('Altın fiyatı önbellekte yok; portföy altın değeri geçici olarak boş gösterilecek.');
  return { buyPrice: null, sellPrice: null, fetchedAt: null, previousBuyPrice: null };
}

export async function getPortfolio(): Promise<PortfolioResponse> {
  const rows = stmtListPortfolio.all() as PortfolioRowEnriched[];
  const gold = resolveGoldPrice(rows);
  const holdings = rows.map((row) => enrich(row, gold));

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

  const goldHolding = holdings.find((h) => h.is_gold);
  const summaryGoldBuy =
    gold.buyPrice ?? goldHolding?.latest_price ?? null;
  const summaryGoldSell = gold.sellPrice ?? null;

  return {
    summary: {
      totalCost,
      currentValue: hasAnyPrice ? currentValue : 0,
      profitAndLoss: hasAnyPrice ? profitAndLoss : 0,
      profitAndLossPct,
      gold_price: summaryGoldBuy,
      gold_buy_price: summaryGoldBuy,
      gold_sell_price: summaryGoldSell,
      gold_price_fetched_at: gold.fetchedAt ?? goldHolding?.latest_price_date ?? null,
    },
    holdings,
  };
}

export function getPortfolioHistory(): PortfolioHistoryRow[] {
  return stmtListHistory.all() as PortfolioHistoryRow[];
}

export function clearPortfolioHistory(): number {
  return stmtClearHistory.run().changes;
}

export function deletePortfolioHistoryEntry(id: number): boolean {
  return stmtDeleteHistoryEntry.run(id).changes > 0;
}

export async function addPortfolioEntry(input: {
  fund_code: string;
  buy_date: string;
  buy_price: number;
  quantity: number;
}): Promise<PortfolioHolding> {
  const insertTxn = db.transaction(() => {
    const result = stmtInsertPortfolio.run(
      input.fund_code,
      input.buy_date,
      input.buy_price,
      input.quantity
    );
    stmtInsertHistory.run(
      input.fund_code,
      'BUY',
      input.buy_date,
      input.buy_price,
      input.quantity,
      0
    );
    return Number(result.lastInsertRowid);
  });

  const id = insertTxn();
  const all = await getPortfolio();
  const holding = all.holdings.find((h) => h.id === id);
  if (!holding) throw new Error('Portföy kaydı oluşturulamadı.');
  return holding;
}

export async function deletePortfolioEntry(id: number): Promise<boolean> {
  const row = stmtGetPortfolioById.get(id) as PortfolioRow | undefined;
  if (!row) return false;

  const latestPrice = await resolveLatestPrice(row.fund_code);
  const sellPrice = latestPrice ?? row.buy_price;
  const realizedPnl = (sellPrice - row.buy_price) * row.quantity;

  const sellTxn = db.transaction(() => {
    stmtInsertHistory.run(
      row.fund_code,
      'SELL',
      todayIso(),
      sellPrice,
      row.quantity,
      realizedPnl
    );
    return stmtDeletePortfolio.run(id).changes > 0;
  });

  return sellTxn();
}
