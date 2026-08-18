import Database from 'better-sqlite3';

const db = new Database('c:/Users/T1G3R-l/Desktop/fontakip2/fundtrack-local/server/funds.db', {
  readonly: true,
});
const altin = db
  .prepare(
    `SELECT COUNT(*) AS c, MAX(price_date) AS maxD FROM price_history WHERE fund_code = 'ALTIN'`
  )
  .get();
const fund = db.prepare(`SELECT * FROM funds WHERE fund_code = 'ALTIN'`).get();
console.log('ALTIN fund:', fund);
console.log('ALTIN price_history:', altin);
db.close();
