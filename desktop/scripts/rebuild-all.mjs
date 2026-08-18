/**
 * Full desktop rebuild: client + server bundle + seed DB + win-unpacked + NSIS installer.
 * Always use this (or `npm run dist`) after client/server changes — NOT `prepare:all` alone.
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const PRODUCT_NAME = 'Fon Takip Programı';
const RESOURCES_CLIENT = path.join(DESKTOP, 'resources', 'client', 'index.html');
const UNPACKED_CLIENT = path.join(DESKTOP, 'installer', 'win-unpacked', 'resources', 'client', 'index.html');

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

function killRunningApp() {
  if (process.platform !== 'win32') return;
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-Process -Name '${PRODUCT_NAME}' -ErrorAction SilentlyContinue | Stop-Process -Force`,
    ],
    { stdio: 'ignore' }
  );
}

function readBundleRef(htmlPath) {
  if (!fs.existsSync(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/src="\/assets\/(index-[^"]+\.js)"/);
  return m ? m[1] : null;
}

step('0/5 Çalışan uygulama süreçleri kapatılıyor (varsa)');
killRunningApp();

step('1/5 prepare:all (client + server.cjs + funds.seed.db)');
execSync('node prepare.mjs', { cwd: DESKTOP, stdio: 'inherit' });

step('2/5 electron-builder (win-unpacked + NSIS installer)');
execSync('node scripts/patch-app-builder.mjs', { cwd: DESKTOP, stdio: 'inherit' });
execSync('npx electron-builder --win --x64', { cwd: DESKTOP, stdio: 'inherit', env: { ...process.env } });

step('3/5 Paket doğrulaması');
const resourcesBundle = readBundleRef(RESOURCES_CLIENT);
const unpackedBundle = readBundleRef(UNPACKED_CLIENT);

if (!resourcesBundle) {
  throw new Error(`resources/client bundle bulunamadı: ${RESOURCES_CLIENT}`);
}
if (!unpackedBundle) {
  throw new Error(`win-unpacked bundle bulunamadı: ${UNPACKED_CLIENT}`);
}
if (resourcesBundle !== unpackedBundle) {
  throw new Error(
    `win-unpacked güncel değil!\n  resources: ${resourcesBundle}\n  unpacked:  ${unpackedBundle}\n` +
      'npm run dist yeniden çalıştırın.'
  );
}

const setupExe = path.join(DESKTOP, 'installer', `${PRODUCT_NAME} Setup 1.0.0.exe`);
const unpackedExe = path.join(DESKTOP, 'installer', 'win-unpacked', `${PRODUCT_NAME}.exe`);

if (!fs.existsSync(setupExe)) {
  throw new Error(`NSIS installer bulunamadı: ${setupExe}`);
}
const setupSizeMb = fs.statSync(setupExe).size / 1024 / 1024;
if (setupSizeMb < 50) {
  throw new Error(
    `NSIS installer bozuk görünüyor (${setupSizeMb.toFixed(1)} MB). ` +
      'Beklenen ~115 MB. electron-builder çıktısını kontrol edin.'
  );
}

step('4/5 Yerel kurulum dosyaları + Unblock');
const installerDir = path.join(DESKTOP, 'installer');
for (const file of ['install-windows.ps1', 'Install-FundTrack.bat', 'Remove-FundTrack.bat']) {
  fs.copyFileSync(path.join(DESKTOP, 'scripts', file), path.join(installerDir, file));
}
if (process.platform === 'win32') {
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Unblock-File -LiteralPath '${setupExe.replace(/'/g, "''")}'; ` +
        `Get-ChildItem -LiteralPath '${path.join(installerDir, 'win-unpacked').replace(/'/g, "''")}' -Recurse -File -Filter *.exe | Unblock-File`,
    ],
    { stdio: 'ignore' }
  );
}

step('5/5 NSIS install/uninstall doğrulaması');
execSync('node scripts/verify-nsis-installer.mjs', { cwd: DESKTOP, stdio: 'inherit' });

console.log('\n=== Tam derleme tamamlandı ===');
console.log(`Bundle: ${resourcesBundle}`);
console.log(`win-unpacked: ${unpackedExe}`);
console.log(`installer:    ${setupExe} (${setupSizeMb.toFixed(1)} MB)`);
console.log(`yerel kurulum: ${path.join(installerDir, 'Install-FundTrack.bat')}`);
