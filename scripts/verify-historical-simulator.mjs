/**
 * Double-check Tarihsel Kıyaslama math against live /api/funds/:code/history.
 */
const API = 'http://127.0.0.1:3001/api';
const CURRENT_TAX_RATE = 17.5;
const CAPITAL = 100_000;
const ENTRY_DATE = '2025-01-01';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function findClosestTradingDayOnOrAfter(historyData, targetDate) {
  const exact = historyData.find((record) => record.price_date === targetDate);
  if (exact) return exact;

  let onOrAfter;
  for (const record of historyData) {
    if (record.price_date < targetDate) continue;
    if (!onOrAfter || record.price_date < onOrAfter.price_date) onOrAfter = record;
  }
  return onOrAfter;
}

function computeWhatIf(fund, history, globalCapital, customQuantity, customEntryPrice, entryDate, daysPassed) {
  const current = history[0];
  if (!current || current.price <= 0) return null;

  const entryPoint = findClosestTradingDayOnOrAfter(history, entryDate);
  const fetchedHistoricalPrice = entryPoint && entryPoint.price > 0 ? entryPoint.price : null;

  const hasCustomEntryPrice = customEntryPrice != null && customEntryPrice > 0;
  const resolvedPastPrice = hasCustomEntryPrice ? customEntryPrice : fetchedHistoricalPrice;
  if (resolvedPastPrice == null || resolvedPastPrice <= 0) return null;

  const hasCustomQuantity = customQuantity != null && customQuantity > 0;
  let resolvedAdet;
  if (hasCustomQuantity) {
    resolvedAdet = customQuantity;
  } else {
    if (globalCapital <= 0) return null;
    resolvedAdet = globalCapital / resolvedPastPrice;
  }

  const currentPrice = current.price;
  const initialInvestment = resolvedAdet * resolvedPastPrice;
  const currentValue = resolvedAdet * currentPrice;
  const grossProfit = currentValue - initialInvestment;
  const isTaxable = fund.is_tax_free === 0;
  const taxAmount = isTaxable && grossProfit > 0 ? grossProfit * (CURRENT_TAX_RATE / 100) : 0;
  const netProfit = grossProfit - taxAmount;
  const profitPercentage = (netProfit / initialInvestment) * 100;
  const dailyAvgProfit = netProfit / daysPassed;

  return {
    entryDateUsed: entryPoint?.price_date ?? null,
    currentDate: current.price_date,
    resolvedPastPrice,
    currentPrice,
    resolvedAdet,
    initialInvestment,
    currentValue,
    grossProfit,
    isTaxable,
    taxAmount,
    netProfit,
    profitPercentage,
    dailyAvgProfit,
  };
}

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const today = todayIso();
const daysPassed = daysBetween(ENTRY_DATE, today);

const funds = await getJson('/funds');
const taxed = funds.find((f) => f.is_active === 1 && f.is_tax_free === 0 && f.fund_code !== 'ALTIN');
const taxFree = funds.find((f) => f.is_active === 1 && f.is_tax_free === 1 && f.fund_code !== 'ALTIN');

if (!taxed || !taxFree) {
  throw new Error('Could not find taxed/tax-free sample funds');
}

const scenarios = [
  { label: 'capital-only (taxed)', code: taxed.fund_code, qty: null, price: null },
  { label: 'capital-only (tax-free)', code: taxFree.fund_code, qty: null, price: null },
  { label: 'custom qty (taxed)', code: taxed.fund_code, qty: 1000, price: null },
  { label: 'custom price (tax-free)', code: taxFree.fund_code, qty: null, price: 0.5 },
];

console.log(`Today: ${today} | Days since ${ENTRY_DATE}: ${daysPassed}`);
console.log(`Sample taxed: ${taxed.fund_code} | tax-free: ${taxFree.fund_code}\n`);

let failures = 0;

for (const s of scenarios) {
  const data = await getJson(`/funds/${encodeURIComponent(s.code)}/history`);

  if (!Array.isArray(data.history) || data.history.length === 0) {
    console.log(`FAIL ${s.label}: empty history`);
    failures++;
    continue;
  }

  const newest = data.history[0];
  const oldest = data.history[data.history.length - 1];
  const isDescending =
    data.history.length < 2 || data.history[0].price_date >= data.history[1].price_date;

  if (!isDescending) {
    console.log(`FAIL ${s.label}: history not newest-first`);
    failures++;
  }

  const fund = data.fund;
  const result = computeWhatIf(fund, data.history, CAPITAL, s.qty, s.price, ENTRY_DATE, daysPassed);
  if (!result) {
    console.log(`FAIL ${s.label}: compute returned null`);
    failures++;
    continue;
  }

  const expectedInitial =
    s.qty != null ? s.qty * result.resolvedPastPrice : CAPITAL;
  const expectedAdet = s.qty != null ? s.qty : CAPITAL / result.resolvedPastPrice;
  const expectedGross = result.currentValue - expectedInitial;
  const expectedTax =
    fund.is_tax_free === 0 && expectedGross > 0 ? expectedGross * 0.175 : 0;
  const expectedNet = expectedGross - expectedTax;

  const checks = [
    ['initialInvestment', result.initialInvestment, expectedInitial],
    ['adet', result.resolvedAdet, expectedAdet],
    ['grossProfit', result.grossProfit, expectedGross],
    ['taxAmount', result.taxAmount, expectedTax],
    ['netProfit', result.netProfit, expectedNet],
    ['currentValue', result.currentValue, expectedAdet * result.currentPrice],
  ];

  let ok = true;
  for (const [name, actual, expected] of checks) {
    if (Math.abs(actual - expected) > 0.01) {
      console.log(`FAIL ${s.label} ${name}: got ${actual}, expected ${expected}`);
      ok = false;
      failures++;
    }
  }

  if (ok) {
    console.log(`OK   ${s.label}`);
    console.log(
      `     entry@${result.entryDateUsed} price=${result.resolvedPastPrice} -> current@${result.currentDate} price=${result.currentPrice}`
    );
    console.log(
      `     adet=${result.resolvedAdet.toFixed(4)} | gross=${result.grossProfit.toFixed(2)} | tax=${result.taxAmount.toFixed(2)} | net=${result.netProfit.toFixed(2)} | net%=${result.profitPercentage.toFixed(2)}`
    );
  }

  if (oldest.price_date > ENTRY_DATE) {
    console.log(`WARN ${s.label}: fund history starts ${oldest.price_date} (after entry ${ENTRY_DATE})`);
  }
}

console.log(`\nHistory span check done. Failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
