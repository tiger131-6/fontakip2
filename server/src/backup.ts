import db, { type FundRow, type PortfolioRow, type PriceRow } from './db';

export interface WatchlistRow {
  fund_code: string;
}

export interface BackupPayload {
  funds: FundRow[];
  price_history: PriceRow[];
  portfolio: PortfolioRow[];
  watchlist: WatchlistRow[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Geçersiz yedek: ${field} metin olmalı.`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Geçersiz yedek: ${field} sayı olmalı.`);
  }
  return n;
}

function asInt(value: unknown, field: string): number {
  const n = asNumber(value, field);
  if (!Number.isInteger(n)) {
    throw new Error(`Geçersiz yedek: ${field} tam sayı olmalı.`);
  }
  return n;
}

export function validateBackupPayload(body: unknown): BackupPayload {
  if (!isRecord(body)) {
    throw new Error('Geçersiz yedek: JSON nesnesi bekleniyor.');
  }

  const { funds, price_history, portfolio, watchlist } = body;

  if (!Array.isArray(funds)) throw new Error('Geçersiz yedek: funds dizisi gerekli.');
  if (!Array.isArray(price_history)) {
    throw new Error('Geçersiz yedek: price_history dizisi gerekli.');
  }
  if (!Array.isArray(portfolio)) throw new Error('Geçersiz yedek: portfolio dizisi gerekli.');
  if (!Array.isArray(watchlist)) throw new Error('Geçersiz yedek: watchlist dizisi gerekli.');

  const parsedFunds: FundRow[] = funds.map((row, i) => {
    if (!isRecord(row)) throw new Error(`Geçersiz yedek: funds[${i}] geçersiz.`);
    return {
      fund_code: asString(row.fund_code, `funds[${i}].fund_code`),
      fund_name: asString(row.fund_name, `funds[${i}].fund_name`),
      is_tax_free: asInt(row.is_tax_free ?? 0, `funds[${i}].is_tax_free`),
      is_active: asInt(row.is_active ?? 1, `funds[${i}].is_active`),
    };
  });

  const parsedHistory: PriceRow[] = price_history.map((row, i) => {
    if (!isRecord(row)) throw new Error(`Geçersiz yedek: price_history[${i}] geçersiz.`);
    const parsed: PriceRow = {
      id: asInt(row.id, `price_history[${i}].id`),
      fund_code: asString(row.fund_code, `price_history[${i}].fund_code`),
      price_date: asString(row.price_date, `price_history[${i}].price_date`),
      price: asNumber(row.price, `price_history[${i}].price`),
    };
    if (row.portfolio_value != null) {
      parsed.portfolio_value = asNumber(row.portfolio_value, `price_history[${i}].portfolio_value`);
    }
    if (row.total_pay_value != null) {
      parsed.total_pay_value = asNumber(row.total_pay_value, `price_history[${i}].total_pay_value`);
    }
    if (row.total_shares != null) {
      parsed.total_shares = asNumber(row.total_shares, `price_history[${i}].total_shares`);
    }
    if (row.investor_count != null) {
      parsed.investor_count = asInt(row.investor_count, `price_history[${i}].investor_count`);
    }
    if (row.active_value != null) {
      parsed.active_value = asNumber(row.active_value, `price_history[${i}].active_value`);
    }
    if (row.occupancy_rate != null) {
      parsed.occupancy_rate = asNumber(row.occupancy_rate, `price_history[${i}].occupancy_rate`);
    }
    return parsed;
  });

  const parsedPortfolio: PortfolioRow[] = portfolio.map((row, i) => {
    if (!isRecord(row)) throw new Error(`Geçersiz yedek: portfolio[${i}] geçersiz.`);
    return {
      id: asInt(row.id, `portfolio[${i}].id`),
      fund_code: asString(row.fund_code, `portfolio[${i}].fund_code`),
      buy_date: asString(row.buy_date, `portfolio[${i}].buy_date`),
      buy_price: asNumber(row.buy_price, `portfolio[${i}].buy_price`),
      quantity: asNumber(row.quantity, `portfolio[${i}].quantity`),
    };
  });

  const parsedWatchlist: WatchlistRow[] = watchlist.map((row, i) => {
    if (!isRecord(row)) throw new Error(`Geçersiz yedek: watchlist[${i}] geçersiz.`);
    return {
      fund_code: asString(row.fund_code, `watchlist[${i}].fund_code`),
    };
  });

  return {
    funds: parsedFunds,
    price_history: parsedHistory,
    portfolio: parsedPortfolio,
    watchlist: parsedWatchlist,
  };
}

export function exportBackup(): BackupPayload {
  const funds = db.prepare('SELECT fund_code, fund_name, is_tax_free, is_active FROM funds').all() as FundRow[];
  const price_history = db
    .prepare(
      `SELECT id, fund_code, price_date, price, portfolio_value, total_pay_value, total_shares,
              investor_count, active_value, occupancy_rate
       FROM price_history ORDER BY id`
    )
    .all() as PriceRow[];
  const portfolio = db
    .prepare('SELECT id, fund_code, buy_date, buy_price, quantity FROM portfolio ORDER BY id')
    .all() as PortfolioRow[];
  const watchlist = db.prepare('SELECT fund_code FROM watchlist ORDER BY fund_code').all() as WatchlistRow[];

  return { funds, price_history, portfolio, watchlist };
}

const stmtInsertFund = db.prepare(
  'INSERT INTO funds (fund_code, fund_name, is_tax_free, is_active) VALUES (?, ?, ?, ?)'
);
const stmtInsertPrice = db.prepare(
  `INSERT INTO price_history
     (id, fund_code, price_date, price, portfolio_value, total_pay_value, total_shares,
      investor_count, active_value, occupancy_rate)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const stmtInsertPortfolio = db.prepare(
  'INSERT INTO portfolio (id, fund_code, buy_date, buy_price, quantity) VALUES (?, ?, ?, ?, ?)'
);
const stmtInsertWatchlist = db.prepare('INSERT INTO watchlist (fund_code) VALUES (?)');

function syncAutoincrement(table: 'price_history' | 'portfolio'): void {
  const row = db.prepare(`SELECT MAX(id) AS max_id FROM ${table}`).get() as { max_id: number | null };
  const maxId = row.max_id ?? 0;
  db.prepare(
    `INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET seq = excluded.seq`
  ).run(table, maxId);
}

const restoreBackupTx = db.transaction((payload: BackupPayload): BackupImportResult => {
  db.prepare('DELETE FROM watchlist').run();
  db.prepare('DELETE FROM portfolio').run();
  db.prepare('DELETE FROM price_history').run();
  db.prepare('DELETE FROM funds').run();

  for (const fund of payload.funds) {
    stmtInsertFund.run(fund.fund_code, fund.fund_name, fund.is_tax_free, fund.is_active);
  }

  for (const row of payload.price_history) {
    stmtInsertPrice.run(
      row.id,
      row.fund_code,
      row.price_date,
      row.price,
      row.portfolio_value ?? null,
      row.total_pay_value ?? null,
      row.total_shares ?? null,
      row.investor_count ?? null,
      row.active_value ?? null,
      row.occupancy_rate ?? null
    );
  }

  for (const row of payload.portfolio) {
    stmtInsertPortfolio.run(row.id, row.fund_code, row.buy_date, row.buy_price, row.quantity);
  }

  for (const row of payload.watchlist) {
    stmtInsertWatchlist.run(row.fund_code);
  }

  syncAutoincrement('price_history');
  syncAutoincrement('portfolio');

  return {
    message: 'Yedek başarıyla geri yüklendi.',
    counts: {
      funds: payload.funds.length,
      price_history: payload.price_history.length,
      portfolio: payload.portfolio.length,
      watchlist: payload.watchlist.length,
    },
  };
});

export function importBackup(body: unknown): BackupImportResult {
  const payload = validateBackupPayload(body);
  return restoreBackupTx(payload);
}
