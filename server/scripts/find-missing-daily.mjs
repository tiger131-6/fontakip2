import Database from 'better-sqlite3';

const dbPath =
  process.argv[2] ||
  process.env.DB_PATH ||
  'C:/Users/T1G3R-l/AppData/Roaming/FundTrack Local/funds.db';

const db = new Database(dbPath, { readonly: true });

const activeCount = db
  .prepare('SELECT COUNT(*) AS n FROM funds WHERE is_active = 1')
  .get().n;
const latestGlobal = db.prepare('SELECT MAX(price_date) AS d FROM price_history').get().d;

console.log('DB:', dbPath);
console.log('Active funds:', activeCount);
console.log('Latest price date in DB:', latestGlobal);

const missing = db
  .prepare(
    `SELECT f.fund_code, f.fund_name, MAX(ph.price_date) AS last_date
     FROM funds f
     LEFT JOIN price_history ph ON ph.fund_code = f.fund_code
     WHERE f.is_active = 1
     GROUP BY f.fund_code, f.fund_name
     HAVING last_date IS NULL OR last_date < ?
     ORDER BY f.fund_code`
  )
  .all(latestGlobal);

console.log('\nFunds NOT on latest date (' + latestGlobal + '):', missing.length);
for (const m of missing) {
  console.log(`  ${m.fund_code}  last=${m.last_date ?? 'NONE'}  ${m.fund_name}`);
}

const missingToday = db
  .prepare(
    `SELECT f.fund_code, f.fund_name
     FROM funds f
     WHERE f.is_active = 1
       AND NOT EXISTS (
         SELECT 1 FROM price_history ph
         WHERE ph.fund_code = f.fund_code AND ph.price_date = ?
       )
     ORDER BY f.fund_code`
  )
  .all(latestGlobal);

console.log('\nActive funds with NO row on', latestGlobal + ':', missingToday.length);
for (const m of missingToday) {
  console.log(`  ${m.fund_code}  ${m.fund_name}`);
}

db.close();
