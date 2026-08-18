/**
 * Schema bootstrap and incremental migrations shared by better-sqlite3 and sql.js.
 */

export interface DbLike {
  pragma(source: string): unknown;
  exec(source: string): void;
  prepare(source: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown;
  };
}

export function applySchemaMigrations(db: DbLike): void {
  try {
    db.pragma('journal_mode = WAL');
  } catch {
    /* sql.js may not support WAL */
  }
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS funds (
      fund_code   TEXT PRIMARY KEY,
      fund_name   TEXT NOT NULL,
      is_tax_free INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code  TEXT NOT NULL,
      price_date TEXT NOT NULL,
      price      REAL NOT NULL,
      FOREIGN KEY (fund_code) REFERENCES funds(fund_code) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_unique
      ON price_history (fund_code, price_date);

    CREATE TABLE IF NOT EXISTS portfolio (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code  TEXT NOT NULL,
      buy_date   TEXT NOT NULL,
      buy_price  REAL NOT NULL,
      quantity   REAL NOT NULL,
      FOREIGN KEY (fund_code) REFERENCES funds(fund_code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      fund_code TEXT PRIMARY KEY,
      FOREIGN KEY (fund_code) REFERENCES funds(fund_code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS portfolio_history (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code        TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('BUY', 'SELL')),
      transaction_date TEXT NOT NULL,
      price            REAL NOT NULL,
      quantity         REAL NOT NULL,
      realized_pnl     REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (fund_code) REFERENCES funds(fund_code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dividends (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code  TEXT NOT NULL,
      amount_tl  REAL NOT NULL,
      date       TEXT NOT NULL,
      FOREIGN KEY (fund_code) REFERENCES funds(fund_code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code    TEXT NOT NULL,
      target_price REAL NOT NULL,
      condition    TEXT NOT NULL CHECK (condition IN ('ABOVE', 'BELOW')),
      is_active    INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (fund_code) REFERENCES funds(fund_code) ON DELETE CASCADE
    );
  `);

  const priceCols = db.prepare('PRAGMA table_info(price_history)').all() as Array<{ name: string }>;
  const priceColNames = new Set(priceCols.map((c) => c.name));
  if (!priceColNames.has('portfolio_value')) {
    db.exec('ALTER TABLE price_history ADD COLUMN portfolio_value REAL');
  }
  if (!priceColNames.has('total_shares')) {
    db.exec('ALTER TABLE price_history ADD COLUMN total_shares REAL');
  }
  if (!priceColNames.has('investor_count')) {
    db.exec('ALTER TABLE price_history ADD COLUMN investor_count INTEGER');
  }
  if (!priceColNames.has('occupancy_rate')) {
    db.exec('ALTER TABLE price_history ADD COLUMN occupancy_rate REAL');
  }
  if (!priceColNames.has('total_pay_value')) {
    db.exec('ALTER TABLE price_history ADD COLUMN total_pay_value REAL');
  }
  if (!priceColNames.has('active_value')) {
    db.exec('ALTER TABLE price_history ADD COLUMN active_value REAL');
  }

  const fundCols = db.prepare('PRAGMA table_info(funds)').all() as Array<{ name: string }>;
  if (!fundCols.some((c) => c.name === 'is_active')) {
    db.exec('ALTER TABLE funds ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  }
  if (!fundCols.some((c) => c.name === 'umbrella_type')) {
    db.exec('ALTER TABLE funds ADD COLUMN umbrella_type TEXT');
  }

  db.prepare(
    `INSERT OR IGNORE INTO funds (fund_code, fund_name, is_tax_free, is_active)
     VALUES ('ALTIN', 'Gram Altın', 0, 1)`
  ).run();
}
