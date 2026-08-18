/** Quick sanity check for 08:00 reset threshold logic. */
function getResetThreshold(now) {
  const threshold = new Date(now);
  threshold.setHours(8, 0, 0, 0);
  if (now < threshold) threshold.setDate(threshold.getDate() - 1);
  return threshold;
}

function shouldRun(lastIso, now) {
  if (!lastIso) return true;
  const last = new Date(lastIso);
  if (Number.isNaN(last.getTime())) return true;
  return last < getResetThreshold(now);
}

const cases = [
  {
    name: 'empty last_sync -> run',
    last: null,
    now: new Date(2026, 5, 11, 10, 0, 0),
    expect: true,
  },
  {
    name: 'synced today 09:00 -> skip',
    last: new Date(2026, 5, 11, 9, 0, 0).toISOString(),
    now: new Date(2026, 5, 11, 10, 0, 0),
    expect: false,
  },
  {
    name: 'synced yesterday 09:00, now today 10:00 -> run',
    last: new Date(2026, 5, 10, 9, 0, 0).toISOString(),
    now: new Date(2026, 5, 11, 10, 0, 0),
    expect: true,
  },
  {
    name: 'now 07:30 today, synced yesterday 09:00 -> skip (before 08:00)',
    last: new Date(2026, 5, 10, 9, 0, 0).toISOString(),
    now: new Date(2026, 5, 11, 7, 30, 0),
    expect: false,
  },
];

let failed = 0;
for (const c of cases) {
  const got = shouldRun(c.last, c.now);
  const ok = got === c.expect;
  console.log(`${ok ? 'OK' : 'FAIL'} ${c.name}: ${got}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
