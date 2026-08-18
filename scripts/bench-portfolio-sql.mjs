import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/package.json'));
const Database = require('better-sqlite3');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../server/funds.db');
const db = new Database(dbPath, { readonly: true });

const OLD = `
  SELECT
    p.id,
    p.fund_code,
    (
      SELECT ph.price
      FROM price_history ph
      WHERE ph.fund_code = p.fund_code
      ORDER BY ph.price_date DESC
      LIMIT 1
    ) AS latest_price,
    (
      SELECT ph.price_date
      FROM price_history ph
      WHERE ph.fund_code = p.fund_code
      ORDER BY ph.price_date DESC
      LIMIT 1
    ) AS latest_price_date,
    (
      SELECT ph.price
      FROM price_history ph
      WHERE ph.fund_code = p.fund_code
      ORDER BY ph.price_date DESC
      LIMIT 1 OFFSET 1
    ) AS previous_day_price
  FROM portfolio p
  LEFT JOIN funds f ON f.fund_code = p.fund_code
  ORDER BY p.id DESC
`;

const NEW = `
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
`;

function bench(label, sql) {
  const stmt = db.prepare(sql);
  stmt.get(); // warm
  const start = performance.now();
  const rows = stmt.all();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(1)}ms (${rows.length} rows)`);
  return rows;
}

const oldRows = bench('OLD correlated subqueries', OLD);
const newRows = bench('NEW window join', NEW);

for (let i = 0; i < oldRows.length; i++) {
  const o = oldRows[i];
  const n = newRows[i];
  if (o.latest_price !== n.latest_price || o.previous_day_price !== n.previous_day_price) {
    console.log('MISMATCH', o.fund_code, o.latest_price, n.latest_price);
  }
}
console.log('Results match check done');
