import {
  FONBUL_PARALLEL_WORKERS,
  fetchFonbulFundRangeStandalone,
  listFonbulFundCodes,
} from '../src/fonbul';

const endDate = new Date().toISOString().slice(0, 10);
const startDate = endDate;
const codes = listFonbulFundCodes().slice(0, FONBUL_PARALLEL_WORKERS);

async function main(): Promise<void> {
  console.log(`workers: ${FONBUL_PARALLEL_WORKERS}, testing funds: ${codes.length}`);

  const started = Date.now();
  const results = await Promise.all(
    codes.map(async (code) => {
      const t0 = Date.now();
      try {
        const rows = await fetchFonbulFundRangeStandalone(code, startDate, endDate);
        return { code, ok: true as const, rows: rows.length, ms: Date.now() - t0 };
      } catch (err) {
        return {
          code,
          ok: false as const,
          err: err instanceof Error ? err.message : String(err),
          ms: Date.now() - t0,
        };
      }
    })
  );

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);

  console.log(`elapsed_ms: ${Date.now() - started}`);
  console.log(`success: ${ok.length}, fail: ${fail.length}`);
  if (ok.length > 0) console.log('sample ok:', ok.slice(0, 3));
  if (fail.length > 0) console.log('failures:', fail);
}

void main();
