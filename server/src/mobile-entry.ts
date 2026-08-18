/**
 * Android embedded Node entry: init sql.js DB, then start the Express API.
 */

import fs from 'fs';
import path from 'path';
import { initSqlJsDatabase } from './db-instance';

const PORT = Number(process.env.PORT) || 38473;
const HOST = process.env.HOST || '127.0.0.1';

function ensureWritableDatabase(): string {
  const dataDir = process.env.FUNDTRACK_DATA_DIR || path.dirname(process.env.DB_PATH || '');
  const userDbPath = process.env.DB_PATH || path.join(dataDir, 'funds.db');
  const seedPath = process.env.SEED_DB_PATH || path.join(__dirname, 'funds.seed.db');

  fs.mkdirSync(path.dirname(userDbPath), { recursive: true });

  if (!fs.existsSync(userDbPath) && fs.existsSync(seedPath)) {
    console.log(`[mobile] Copying seed DB -> ${userDbPath}`);
    fs.copyFileSync(seedPath, userDbPath);
  }

  return userDbPath;
}

export async function bootstrapMobileServer(): Promise<void> {
  process.env.USE_SQLJS = '1';
  process.env.FUNDTRACK_DEFER_LISTEN = '1';

  const dbPath = ensureWritableDatabase();
  const wasmPath = path.join(__dirname, 'sql-wasm.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`sql-wasm.wasm bulunamadı: ${wasmPath}`);
  }

  console.log(`[mobile] Opening database: ${dbPath}`);
  await initSqlJsDatabase(dbPath, wasmPath);

  const { startApi } = await import('./index');
  startApi(PORT, HOST);
  console.log(`[mobile] API ready at http://${HOST}:${PORT}`);
}

bootstrapMobileServer().catch((err) => {
  console.error('[mobile] Startup failed:', err);
  process.exitCode = 1;
});
