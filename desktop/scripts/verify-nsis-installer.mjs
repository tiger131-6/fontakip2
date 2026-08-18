/**
 * Smoke-test NSIS installer: silent install + silent uninstall to a temp folder.
 * Fails the build if integrity/uninstaller is broken.
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(__dirname, '..');
const PRODUCT = 'Fon Takip Programı';
const SETUP = path.join(DESKTOP, 'installer', `${PRODUCT} Setup 1.0.0.exe`);

function step(msg) {
  console.log(`\n[verify-nsis] ${msg}`);
}

if (process.platform !== 'win32') {
  console.log('[verify-nsis] Skipped (Windows only)');
  process.exit(0);
}

if (!fs.existsSync(SETUP)) {
  throw new Error(`Installer not found: ${SETUP}`);
}

const sizeMb = fs.statSync(SETUP).size / 1024 / 1024;
if (sizeMb < 50) {
  throw new Error(`Installer too small (${sizeMb.toFixed(1)} MB) — likely corrupt`);
}

spawnSync(
  'powershell',
  ['-NoProfile', '-Command', `Get-Process -Name '${PRODUCT}' -ErrorAction SilentlyContinue | Stop-Process -Force`],
  { stdio: 'ignore' }
);

const testRoot = path.join(os.tmpdir(), `fundtrack-nsis-${Date.now()}`);
const installDir = path.join(testRoot, 'app');
fs.mkdirSync(installDir, { recursive: true });

step(`Silent install -> ${installDir}`);
try {
  const install = spawnSync(SETUP, ['/S', `/D=${installDir}`], {
    timeout: 180000,
    encoding: 'utf8',
  });
  if (install.status !== 0) {
    const detail = [install.stdout, install.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Silent install failed (exit ${install.status})${detail ? `: ${detail}` : ''}`);
  }
} catch (err) {
  fs.rmSync(testRoot, { recursive: true, force: true });
  throw err;
}

const uninstallCandidates = [
  path.join(installDir, `Uninstall ${PRODUCT}.exe`),
  path.join(installDir, 'Uninstall.exe'),
];

const uninstaller = uninstallCandidates.find((p) => fs.existsSync(p));
if (!uninstaller) {
  fs.rmSync(testRoot, { recursive: true, force: true });
  throw new Error(
    `Uninstaller not found after install. Checked:\n  ${uninstallCandidates.join('\n  ')}`
  );
}

step(`Silent uninstall <- ${uninstaller}`);
const uninstall = spawnSync(uninstaller, ['/S'], { timeout: 180000, encoding: 'utf8' });
if (uninstall.status !== 0) {
  const detail = [uninstall.stdout, uninstall.stderr].filter(Boolean).join('\n').trim();
  throw new Error(`Silent uninstall failed (exit ${uninstall.status})${detail ? `: ${detail}` : ''}`);
}

// Uninstall succeeded — NSIS integrity is OK. Temp cleanup may fail if AV holds locks.
spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 2'], { stdio: 'ignore' });
try {
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  }
} catch {
  console.warn(`[verify-nsis] Temp cleanup skipped: ${testRoot}`);
}

step('NSIS install + uninstall OK');
