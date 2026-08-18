import Database from 'better-sqlite3';

const db = new Database('c:/Users/T1G3R-l/Desktop/fontakip2/fundtrack-local/server/funds.db', {
  readonly: true,
});

const global = db
  .prepare(
    'SELECT MAX(price_date) AS maxD, MIN(price_date) AS minD, COUNT(*) AS c FROM price_history WHERE portfolio_value IS NOT NULL'
  )
  .get();
console.log('Global FonBul metrics:', global);

const phe = db
  .prepare(
    `SELECT price_date, price FROM price_history
     WHERE fund_code = 'PHE' AND portfolio_value IS NOT NULL
     ORDER BY price_date DESC LIMIT 15`
  )
  .all();
console.log('\nPHE latest rows:');
for (const row of phe) console.log(row.price_date, row.price);

const priceOnly = db
  .prepare(
    `SELECT MAX(price_date) AS maxD FROM price_history WHERE fund_code = 'PHE' AND price IS NOT NULL`
  )
  .get();
console.log('\nPHE max price (any):', priceOnly);

db.close();
