import Database from 'better-sqlite3';
import { listFonbulCodesNeedingUpdate } from '../src/fonbul.ts';
import { todayIso } from '../src/trading-lookback.ts';

const end = todayIso();
const needing = listFonbulCodesNeedingUpdate(end, 'daily');
console.log('Today:', end);
console.log('Funds needing daily FonBul update:', needing.length);
console.log('PHE included:', needing.includes('PHE'));

const db = new Database('c:/Users/T1G3R-l/Desktop/fontakip2/fundtrack-local/server/funds.db', {
  readonly: true,
});
const before = db
  .prepare(
    `SELECT MAX(CASE WHEN portfolio_value IS NOT NULL THEN price_date END) AS metricMax,
            MAX(price_date) AS priceMax
     FROM price_history WHERE fund_code = 'PHE'`
  )
  .get();
console.log('PHE before:', before);
db.close();
