import Database from 'better-sqlite3';
import fs from 'fs';

const paths = [
  'c:/Users/T1G3R-l/Desktop/fontakip2/fundtrack-local/server/funds.db',
  'C:/Users/T1G3R-l/AppData/Roaming/FundTrack Local/funds.db',
];

for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.log('\n=== MISSING:', p);
    continue;
  }
  const st = fs.statSync(p);
  console.log('\n===', p, '===');
  console.log('size MB:', (st.size / 1024 / 1024).toFixed(2), 'modified:', st.mtime.toISOString());

  const db = new Database(p, { readonly: true });
  const cols = db.prepare('PRAGMA table_info(price_history)').all().map((c) => c.name);
  console.log('columns:', cols.join(', '));

  const totals = db.prepare('SELECT COUNT(*) AS c FROM price_history').get();
  const withMetrics = db
    .prepare(
      `SELECT COUNT(*) AS c FROM price_history
       WHERE portfolio_value IS NOT NULL OR total_shares IS NOT NULL
          OR investor_count IS NOT NULL OR occupancy_rate IS NOT NULL`
    )
    .get();
  const fullMetrics = db
    .prepare(
      `SELECT COUNT(*) AS c FROM price_history
       WHERE portfolio_value IS NOT NULL AND total_shares IS NOT NULL
         AND investor_count IS NOT NULL AND occupancy_rate IS NOT NULL`
    )
    .get();
  const fundsWithMetrics = db
    .prepare(
      'SELECT COUNT(DISTINCT fund_code) AS c FROM price_history WHERE portfolio_value IS NOT NULL'
    )
    .get();

  console.log('total price rows:', totals.c);
  console.log('rows with any FonBul metric:', withMetrics.c);
  console.log('rows with all 4 metrics:', fullMetrics.c);
  console.log('funds with portfolio_value:', fundsWithMetrics.c);

  const sample = db
    .prepare(
      `SELECT fund_code, price_date, price, portfolio_value, total_shares, investor_count, occupancy_rate
       FROM price_history WHERE portfolio_value IS NOT NULL
       ORDER BY price_date DESC LIMIT 5`
    )
    .all();
  console.log('latest samples:', JSON.stringify(sample, null, 2));

  const phe = db
    .prepare(
      `SELECT COUNT(*) AS c, MIN(price_date) AS minD, MAX(price_date) AS maxD
       FROM price_history WHERE fund_code = 'PHE' AND portfolio_value IS NOT NULL`
    )
    .get();
  console.log('PHE FonBul rows:', phe);

  const priceOnly = db
    .prepare(
      `SELECT COUNT(*) AS c FROM price_history
       WHERE price IS NOT NULL AND portfolio_value IS NULL`
    )
    .get();
  console.log('rows with price only (no portfolio_value):', priceOnly.c);

  db.close();
}
