import Database from 'better-sqlite3';
import { fetchFonbulFundRangeStandalone } from '../src/fonbul.ts';

const code = 'PHE';
const rows = await fetchFonbulFundRangeStandalone(code, '2026-06-10', '2026-06-15');
console.log('FonBul API rows:', rows.length);
console.log(
  'Dates:',
  rows.map((r) => r.date)
);

const db = new Database('c:/Users/T1G3R-l/Desktop/fontakip2/fundtrack-local/server/funds.db', {
  readonly: true,
});
const after = db
  .prepare(
    `SELECT price_date FROM price_history
     WHERE fund_code = ? AND portfolio_value IS NOT NULL AND price_date >= '2026-06-10'
     ORDER BY price_date DESC`
  )
  .all(code);
console.log('DB metric dates >= Jun 10:', after.map((r) => r.price_date));
db.close();
