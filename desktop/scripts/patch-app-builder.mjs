/**
 * Patches electron-builder's NSIS target: run the uninstaller stub properly on Windows.
 * UninstallerReader fallback is NOT used — it produced uninstallers that fail NSIS integrity checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NSIS_TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  'app-builder-lib',
  'out',
  'targets',
  'nsis',
  'NsisTarget.js'
);

const ORIGINAL_NEEDLE = `        else {
            await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
        }`;

const READER_ONLY_PATCH = `        else {
            if (isWin) {
                await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
            }
            else {
                await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
            }
        }`;

const HYBRID_PATCH_START = `        else {
            if (isWin) {
                try {
                    const { execFileSync } = require("child_process");
                    const escaped = installerPath.replace(/'/g, "''");
                    execFileSync("powershell.exe", ["-NoProfile", "-Command", \`Unblock-File -LiteralPath '\${escaped}'\`], { stdio: "ignore" });
                    await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
                }
                catch (error) {
                    builder_util_1.log.warn(\`Windows uninstaller stub exec failed, using UninstallerReader: \${error.message || error}\`);
                    await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
                }
            }
            else {
                await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
            }
        }`;

const EXEC_ONLY_PATCH = `        else {
            if (isWin) {
                const { execFileSync } = require("child_process");
                const escaped = installerPath.replace(/'/g, "''");
                execFileSync("powershell.exe", ["-NoProfile", "-Command", \`Unblock-File -LiteralPath '\${escaped}'\`], { stdio: "ignore" });
                await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
                if (!(await (0, builder_util_2.exists)(uninstallerPath))) {
                    throw new Error("NSIS uninstaller stub did not produce an uninstaller. Disable Smart App Control temporarily, then run: cd desktop && npm run dist");
                }
            }
            else {
                await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
            }
        }`;

if (!fs.existsSync(NSIS_TARGET)) {
  console.warn('[patch-app-builder] NsisTarget.js not found, skipping');
  process.exit(0);
}

let src = fs.readFileSync(NSIS_TARGET, 'utf8');
if (src.includes('NSIS uninstaller stub did not produce an uninstaller')) {
  console.log('[patch-app-builder] Already patched (exec-only)');
  process.exit(0);
}

if (src.includes(HYBRID_PATCH_START)) {
  src = src.replace(HYBRID_PATCH_START, EXEC_ONLY_PATCH);
} else if (src.includes(READER_ONLY_PATCH)) {
  src = src.replace(READER_ONLY_PATCH, EXEC_ONLY_PATCH);
} else if (src.includes(ORIGINAL_NEEDLE)) {
  src = src.replace(ORIGINAL_NEEDLE, EXEC_ONLY_PATCH);
} else {
  throw new Error('[patch-app-builder] Expected NSIS patch location not found — electron-builder version changed?');
}

fs.writeFileSync(NSIS_TARGET, src);
console.log('[patch-app-builder] Patched NsisTarget.js (exec-only uninstaller — no corrupt fallback)');
