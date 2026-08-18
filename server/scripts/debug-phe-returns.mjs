import Database from 'better-sqlite3';

const db = new Database('funds.db', { readonly: true });
const code = 'PHE';
const rows = db
  .prepare(
    `SELECT price_date, price FROM price_history
     WHERE fund_code = ? AND price IS NOT NULL AND price > 0
     ORDER BY price_date ASC`
  )
  .all(code);
const latest = rows[rows.length - 1];
const current = latest.price;
console.log('Latest:', latest.price_date, current);

function subtractTime(ds, mo, yr) {
  const [y, m, d] = ds.split('-').map(Number);
  let year = y - yr;
  let month = m - mo;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const dim = [
    31,
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month];
  const day = Math.min(d, dim);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysBefore(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

function mtdAnchor(d) {
  const [y, m] = d.split('-').map(Number);
  let py = y;
  let pm = m - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  const dim = [
    31,
    (py % 4 === 0 && py % 100 !== 0) || py % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][pm];
  return `${py}-${String(pm).padStart(2, '0')}-${String(dim).padStart(2, '0')}`;
}

function findPriceWalk(target) {
  const map = new Map(rows.map((r) => [r.price_date, r.price]));
  let c = target;
  for (let i = 0; i <= 30; i++) {
    if (map.has(c)) return { date: c, price: map.get(c) };
    c = daysBefore(c, 1);
  }
  return null;
}

function findPriceNewestFirst(target) {
  const desc = [...rows].reverse();
  for (const r of desc) {
    if (r.price_date <= target) return r;
  }
  return null;
}

function pct(past) {
  return ((current - past) / past * 100).toFixed(3);
}

const setMonthAnchor = (() => {
  const [y, m, d] = latest.price_date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
})();

const anchors = {
  '1M subtractTime': subtractTime(latest.price_date, 1, 0),
  '1M setMonth': setMonthAnchor,
  'MTD monthStart': `${latest.price_date.slice(0, 7)}-01`,
  'MTD prevMonthEnd (FonBul)': mtdAnchor(latest.price_date),
  'YTD Jan1': `${latest.price_date.slice(0, 4)}-01-01`,
  'YTD Dec31prev (FonBul)': `${Number(latest.price_date.slice(0, 4)) - 1}-12-31`,
  '6M': subtractTime(latest.price_date, 6, 0),
  '1Y': subtractTime(latest.price_date, 0, 1),
};

console.log('\n--- walk-back lookup (FonBul style) ---');
for (const [k, v] of Object.entries(anchors)) {
  try {
    const p = findPriceWalk(v);
    console.log(k, v, '->', p?.date, pct(p?.price ?? 0));
  } catch (e) {
    console.log(k, v, '-> ERROR', e.message);
  }
}

console.log('\n--- newest-first <= lookup (current client) ---');
for (const [k, v] of Object.entries(anchors)) {
  const p = findPriceNewestFirst(v);
  console.log(k, v, '->', p?.price_date, pct(p?.price ?? 0));
}

console.log('\nFonBul: Aylık 20.856, Aybaşı 21.900, 6M 136.694, Yılbaşı 141.383, Yıllık 206.361');
console.log('App table: 1Ay 18.44, YTD 142.28 (from screenshot)');

const yBoundary = db
  .prepare(
    `SELECT price_date, price FROM price_history
     WHERE fund_code = ? AND price_date BETWEEN '2025-12-20' AND '2026-01-10'
     ORDER BY price_date ASC`
  )
  .all(code);
console.log('\n--- year boundary prices ---');
for (const r of yBoundary) console.log(r.price_date, r.price, 'ytd%', pct(r.price));

// on-or-after Jan 1
const jan1 = '2026-01-01';
const onOrAfter = rows.filter((r) => r.price_date >= jan1).sort((a, b) => a.price_date.localeCompare(b.price_date))[0];
console.log('First on/after Jan1:', onOrAfter?.price_date, onOrAfter?.price, 'pct', pct(onOrAfter?.price));

// 1M: try on-or-after vs on-or-before for May 16 anchor
const m1anchor = subtractTime(latest.price_date, 1, 0);
const m1before = findPriceNewestFirst(m1anchor);
const m1after = rows.find((r) => r.price_date >= m1anchor);
console.log('\n1M anchor', m1anchor);
console.log('  <= (before):', m1before?.price_date, pct(m1before?.price));
console.log('  >= (after):', m1after?.price_date, pct(m1after?.price));

// 6M with correct subtractTime (fix script month=0 bug)
function subtractTimeFixed(ds, mo, yr) {
  const [y, m, d] = ds.split('-').map(Number);
  let year = y - yr;
  let month = m - mo;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const dim = [
    31,
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month];
  const day = Math.min(d, dim);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const m6anchorFixed = subtractTimeFixed(latest.price_date, 6, 0);
const m6beforeFixed = findPriceNewestFirst(m6anchorFixed);
const m6afterFixed = rows.find((r) => r.price_date >= m6anchorFixed);
console.log('\n6M anchor (fixed)', m6anchorFixed);
console.log('  <= (before):', m6beforeFixed?.price_date, pct(m6beforeFixed?.price));
console.log('  >= (after):', m6afterFixed?.price_date, pct(m6afterFixed?.price));

db.close();
