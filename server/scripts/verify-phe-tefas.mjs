import Database from 'better-sqlite3';

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}
function subtractTime(ds, mo, yr) {
  const [y, m, d] = ds.split('-').map(Number);
  let year = y - yr;
  let month = m - mo;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const maxDay = daysInMonth(year, month);
  const day = Math.min(d, maxDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function monthStart(ds) {
  return `${ds.slice(0, 7)}-01`;
}
function yearStart(ds) {
  return `${ds.slice(0, 4)}-01-01`;
}
function findOnOrAfter(desc, target) {
  const exact = desc.find((r) => r.price_date === target);
  if (exact) return exact;
  let best;
  for (const r of desc) {
    if (r.price_date < target) continue;
    if (!best || r.price_date < best.price_date) best = r;
  }
  return best;
}
function pct(cur, past) {
  return ((cur - past) / past * 100).toFixed(3);
}

const db = new Database('funds.db', { readonly: true });
const code = 'PHE';
const desc = db
  .prepare(
    `SELECT price_date, price FROM price_history
     WHERE fund_code = ? AND price IS NOT NULL AND price > 0
     ORDER BY price_date DESC`
  )
  .all(code);
const latest = desc[0];
const cur = latest.price;

const periods = {
  '1 Ay': subtractTime(latest.price_date, 1, 0),
  '3 Ay': subtractTime(latest.price_date, 3, 0),
  '6 Ay': subtractTime(latest.price_date, 6, 0),
  Yılbaşı: yearStart(latest.price_date),
  '1 Yıl': subtractTime(latest.price_date, 0, 1),
  Aybaşı: monthStart(latest.price_date),
};

console.log('Latest', latest.price_date, cur);
for (const [label, anchor] of Object.entries(periods)) {
  const row = findOnOrAfter(desc, anchor);
  console.log(label, anchor, '->', row?.price_date, pct(cur, row?.price));
}

console.log('\nFonBul expected: Aylık 20.856, Aybaşı 21.900, 6M 136.694, Yılbaşı 141.383, Yıllık 206.361');
db.close();
