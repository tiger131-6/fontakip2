import assert from 'node:assert/strict';
import {
  findHistoricalPrice,
  calculatePeriodReturn,
  wtdAnchor,
  mtdAnchor,
  ytdAnchor,
  daysBeforeIso,
} from '../src/utils/periodicReturns.ts';

const history = [
  { date: '2026-06-02', price: 10 },
  { date: '2026-06-03', price: 10.1 },
  { date: '2026-06-04', price: 10.2 },
  { date: '2026-06-05', price: 10.3 },
  { date: '2026-06-08', price: 10.5 },
  { date: '2026-06-09', price: 10.6 },
  { date: '2026-06-10', price: 10.7 },
  { date: '2026-06-11', price: 10.8 },
  { date: '2026-06-12', price: 11 },
];

assert.equal(findHistoricalPrice(history, '2026-06-07'), 10.3);
assert.equal(findHistoricalPrice(history, '2026-06-12'), 11);

const wtd = calculatePeriodReturn(history, wtdAnchor('2026-06-12'));
assert.ok(wtd != null && wtd > 0);

const oneW = calculatePeriodReturn(history, daysBeforeIso('2026-06-12', 7));
assert.ok(oneW != null);

assert.equal(findHistoricalPrice(history, '2025-06-12'), null);

const shortHistory = [{ date: '2026-05-01', price: 5 }];
assert.equal(calculatePeriodReturn(shortHistory, ytdAnchor('2026-06-12')), null);

assert.equal(mtdAnchor('2026-06-12'), '2026-05-31');
assert.equal(ytdAnchor('2026-06-12'), '2025-12-31');

console.log('periodicReturns tests OK');
