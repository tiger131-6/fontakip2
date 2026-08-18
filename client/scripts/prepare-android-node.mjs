/**
 * Build the embedded Node server + seed DB for standalone Android.
 *
 * Output -> client/dist/nodejs-project/
 *   server-mobile.cjs
 *   sql-wasm.wasm
 *   funds.seed.db
 *   main.js
 */
import { build as esbuild } from 'esbuild';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(__dirname, '..');
const SERVER = path.join(CLIENT, '..', 'server');
const OUT = path.join(CLIENT, 'dist', 'nodejs-project');

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

step('1/4 Server bağımlılıkları (sql.js)');
execSync('npm install', { cwd: SERVER, stdio: 'inherit' });

step('2/4 Mobil sunucu paketleniyor (esbuild)');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

await esbuild({
  entryPoints: [path.join(SERVER, 'src', 'mobile-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: path.join(OUT, 'server-mobile.cjs'),
  logLevel: 'info',
});

const wasmSrc = path.join(SERVER, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
if (!fs.existsSync(wasmSrc)) {
  throw new Error(`sql-wasm.wasm bulunamadı: ${wasmSrc}`);
}
fs.copyFileSync(wasmSrc, path.join(OUT, 'sql-wasm.wasm'));

step('3/4 Tohum veritabanı kopyalanıyor');
const seedCandidates = [
  path.join(CLIENT, '..', 'desktop', 'resources', 'funds.seed.db'),
  path.join(SERVER, 'funds.db'),
];
const seedSrc = seedCandidates.find((p) => fs.existsSync(p));
if (!seedSrc) {
  throw new Error('Tohum veritabanı bulunamadı. Önce desktop prepare veya server sync çalıştırın.');
}
fs.copyFileSync(seedSrc, path.join(OUT, 'funds.seed.db'));
const mb = (fs.statSync(path.join(OUT, 'funds.seed.db')).size / 1024 / 1024).toFixed(1);
console.log(`Tohum DB: ${mb} MB (${seedSrc})`);

step('4/4 Node.js başlatıcı');
const mainJs = `/**
 * FundTrack Android — embedded Express API (auto-started by CapacitorNodeJS).
 */
const fs = require('fs');
const path = require('path');

let dataDir = __dirname;
try {
  const { getDataPath } = require('bridge');
  dataDir = getDataPath();
} catch {
  /* bridge unavailable in dev */
}

const userDb = path.join(dataDir, 'funds.db');
const seedDb = path.join(__dirname, 'funds.seed.db');

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(userDb) && fs.existsSync(seedDb)) {
  console.log('[FundTrack] Copying seed database...');
  fs.copyFileSync(seedDb, userDb);
}

process.env.USE_SQLJS = '1';
process.env.FUNDTRACK_DEFER_LISTEN = '1';
process.env.DB_PATH = userDb;
process.env.SEED_DB_PATH = seedDb;
process.env.FUNDTRACK_DATA_DIR = dataDir;
process.env.PORT = process.env.PORT || '38473';
process.env.HOST = process.env.HOST || '127.0.0.1';

require('./server-mobile.cjs');
`;
fs.writeFileSync(path.join(OUT, 'main.js'), mainJs, 'utf8');

console.log(`\nAndroid Node paketi hazır -> ${OUT}`);
