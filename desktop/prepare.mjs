/**
 * Build everything the Electron app needs, into ./build and ./resources:
 *   1. Build the React client (Vite)         -> ../client/dist  -> resources/client
 *   2. Bundle the Express server (esbuild)    -> build/server.cjs (better-sqlite3 external)
 *   3. Snapshot the seeded SQLite DB (VACUUM)  -> resources/funds.seed.db
 *
 * Run from the desktop/ folder: `node prepare.mjs` (or `npm run prepare:all`).
 */
import { build as esbuild } from 'esbuild';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = __dirname;
const REPO = path.join(ROOT, '..');
const CLIENT = path.join(REPO, 'client');
const SERVER = path.join(REPO, 'server');
const RESOURCES = path.join(ROOT, 'resources');
// NOTE: not "build" — that name is reserved by electron-builder (buildResources)
// and would be excluded from the packaged app.
const BUILD = path.join(ROOT, 'bundle');

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

// 1) Client -------------------------------------------------------------------
step('1/3 React istemcisi derleniyor (vite build)');
execSync('npm run build', { cwd: CLIENT, stdio: 'inherit' });

const clientDist = path.join(CLIENT, 'dist');
if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  throw new Error(`Client build çıktısı bulunamadı: ${clientDist}`);
}
const clientOut = path.join(RESOURCES, 'client');
fs.rmSync(clientOut, { recursive: true, force: true });
fs.mkdirSync(RESOURCES, { recursive: true });
fs.cpSync(clientDist, clientOut, { recursive: true });
console.log(`İstemci kopyalandı -> ${clientOut}`);

// 2) Server -------------------------------------------------------------------
step('2/3 Express sunucusu paketleniyor (esbuild)');
fs.mkdirSync(BUILD, { recursive: true });
await esbuild({
  entryPoints: [path.join(SERVER, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: path.join(BUILD, 'server.cjs'),
  // Native module stays external; resolved from node_modules at runtime.
  external: ['better-sqlite3'],
  logLevel: 'info',
});
console.log(`Sunucu paketlendi -> ${path.join(BUILD, 'server.cjs')}`);

// 3) Seed DB snapshot ---------------------------------------------------------
step('3/3 Tohum veritabanı anlık görüntüsü (VACUUM INTO)');
const liveDb = path.join(SERVER, 'funds.db');
if (!fs.existsSync(liveDb)) {
  throw new Error(`Kaynak veritabanı bulunamadı: ${liveDb}. Önce server'da seed + sync yapın.`);
}
// Use the SERVER's node-ABI better-sqlite3 (desktop's copy is rebuilt for Electron).
const Database = require(path.join(SERVER, 'node_modules', 'better-sqlite3'));
const seedOut = path.join(RESOURCES, 'funds.seed.db');
fs.rmSync(seedOut, { force: true });
const db = new Database(liveDb, { readonly: true });
// Forward slashes + escaped quotes for the SQL string literal.
const target = seedOut.replace(/\\/g, '/').replace(/'/g, "''");
db.exec(`VACUUM INTO '${target}'`);
const count = db.prepare('SELECT COUNT(*) AS c FROM price_history').get().c;
db.close();
const mb = (fs.statSync(seedOut).size / 1024 / 1024).toFixed(1);
console.log(`Tohum DB hazır -> ${seedOut} (${mb} MB, ${count.toLocaleString('tr-TR')} fiyat kaydı)`);

step('Hazırlık tamamlandı.');
console.log(
  '\n⚠  win-unpacked / installer henüz güncellenmedi.\n' +
    '   Test veya dağıtım için tam derleme: cd desktop && npm run dist\n'
);
