const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');

const { autoUpdater } = require('electron-updater');

const path = require('path');

const fs = require('fs');

const http = require('http');



const PORT = 38473;

const isPackaged = app.isPackaged;

const APP_ORIGIN = `http://127.0.0.1:${PORT}`;



// --- Startup diagnostics: append to userData/startup.log so packaged-app

// failures (which have no console) are debuggable. ---

const LOG_PATH = path.join(app.getPath('userData'), 'startup.log');

function logLine(msg) {

  try {

    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);

  } catch {

    /* ignore */

  }

}

process.on('uncaughtException', (err) => logLine(`uncaughtException: ${err && err.stack ? err.stack : err}`));

process.on('unhandledRejection', (err) => logLine(`unhandledRejection: ${err && err.stack ? err.stack : err}`));



// Resources live next to the asar in production, and in ./resources in dev.

const resourcesRoot = isPackaged ? process.resourcesPath : __dirname;

const CLIENT_DIST = path.join(resourcesRoot, isPackaged ? 'client' : path.join('resources', 'client'));

const SEED_DB = path.join(resourcesRoot, isPackaged ? 'funds.seed.db' : path.join('resources', 'funds.seed.db'));



// The live, writable database lives in the per-user data directory so the app

// can refresh/sync prices (the install folder is read-only).

const userDbPath = path.join(app.getPath('userData'), 'funds.db');



/** Copy the bundled seed DB to the writable location on first launch. */

function ensureDatabase() {

  if (fs.existsSync(userDbPath)) return;

  try {

    fs.mkdirSync(path.dirname(userDbPath), { recursive: true });

    if (fs.existsSync(SEED_DB)) {

      fs.copyFileSync(SEED_DB, userDbPath);

    }

  } catch (err) {

    dialog.showErrorBox('Veritabanı hazırlanamadı', String(err && err.message ? err.message : err));

  }

}



/** Start the bundled Express server in-process. */

function startServer() {

  process.env.PORT = String(PORT);

  process.env.CLIENT_DIST = CLIENT_DIST;

  process.env.DB_PATH = userDbPath;

  logLine(`startServer: PORT=${PORT} CLIENT_DIST=${CLIENT_DIST} DB=${userDbPath} SEED=${SEED_DB}`);

  logLine(`paths: __dirname=${__dirname} resourcesRoot=${resourcesRoot} isPackaged=${isPackaged}`);

  const serverPath = path.join(__dirname, 'bundle', 'server.cjs');

  logLine(`requiring server: ${serverPath}`);

  // eslint-disable-next-line global-require

  require(serverPath);

  logLine('server module required OK');

}



/** Resolve once GET /api/health returns 200, or reject after the timeout. */

function waitForServer(timeoutMs = 20000) {

  const started = Date.now();

  return new Promise((resolve, reject) => {

    const tick = () => {

      const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 1000 }, (res) => {

        res.resume();

        if (res.statusCode === 200) resolve();

        else retry();

      });

      req.on('error', retry);

      req.on('timeout', () => {

        req.destroy();

        retry();

      });

    };

    const retry = () => {

      if (Date.now() - started > timeoutMs) reject(new Error('Sunucu zamanında başlatılamadı.'));

      else setTimeout(tick, 250);

    };

    tick();

  });

}



function isInternalAppUrl(url) {

  try {

    const parsed = new URL(url);

    return (

      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&

      parsed.port === String(PORT)

    );

  } catch {

    return false;

  }

}



function isPopoutUrl(url) {

  if (!isInternalAppUrl(url)) return false;

  try {

    return new URL(url).searchParams.has('popout');

  } catch {

    return false;

  }

}



function popoutTitleFromUrl(url) {

  const titles = {

    funds: 'Fonlar (Ana Sayfa)',

    portfolio: 'Portföy',

    simulator: 'Simülatör',

    fonbul: 'FonBul Veri Merkezi',

  };

  try {

    const view = new URL(url).searchParams.get('popout');

    return titles[view] ? `${titles[view]} — Fon Takip Programı` : 'Fon Takip Programı — Terminal';

  } catch {

    return 'Fon Takip Programı — Terminal';

  }

}



function popoutWindowOptions(url) {

  return {

    width: 900,

    height: 700,

    minWidth: 720,

    minHeight: 520,

    backgroundColor: '#f1f5f9',

    title: popoutTitleFromUrl(url),

    autoHideMenuBar: true,

    webPreferences: {

      contextIsolation: true,

      nodeIntegration: false,

    },

  };

}



function attachWindowOpenHandler(win) {

  win.webContents.setWindowOpenHandler(({ url }) => {

    if (isPopoutUrl(url)) {

      logLine(`popout window requested: ${url}`);

      return {

        action: 'allow',

        overrideBrowserWindowOptions: popoutWindowOptions(url),

      };

    }

    if (isInternalAppUrl(url)) {

      return { action: 'deny' };

    }

    shell.openExternal(url);

    return { action: 'deny' };

  });



  win.webContents.on('did-create-window', (childWindow, { url }) => {

    if (!isPopoutUrl(url)) return;

    attachWindowOpenHandler(childWindow);

    childWindow.on('closed', () => logLine(`popout window closed: ${url}`));

  });

}



const LOADING_HTML =

  'data:text/html;charset=utf-8,' +

  encodeURIComponent(`

    <html><head><meta charset="utf-8"><title>Fon Takip Programı</title></head>

    <body style="margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;

                 display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:14px">

      <div style="width:42px;height:42px;border:4px solid #334155;border-top-color:#6366f1;border-radius:50%;

                  animation:spin 1s linear infinite"></div>

      <div style="font-size:15px;color:#94a3b8">Fon Takip Programı başlatılıyor…</div>

      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>

    </body></html>`);



let mainWindow = null;

function sendUpdaterMessage(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-message', payload);
  }
}

function sendUpdaterProgress(percent) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-progress', percent);
  }
}

function setupAutoUpdater(win) {
  if (!isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdaterMessage({ status: 'checking', text: 'Güncelleme kontrol ediliyor...' });
  });

  autoUpdater.on('update-available', (info) => {
    const version = info?.version ?? '';
    sendUpdaterMessage({
      status: 'available',
      text: version
        ? `Yeni bir sürüm bulundu (${version}). İndiriliyor...`
        : 'Yeni bir sürüm bulundu. İndiriliyor...',
      version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdaterMessage({ status: 'up-to-date', text: 'Sisteminiz güncel.' });
  });

  autoUpdater.on('error', (err) => {
    logLine(`autoUpdater error: ${err && err.stack ? err.stack : err}`);
    sendUpdaterMessage({
      status: 'error',
      text: err?.message ? `Güncelleme hatası: ${err.message}` : 'Güncelleme sırasında hata oluştu.',
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendUpdaterProgress(progressObj.percent ?? 0);
  });

  autoUpdater.on('update-downloaded', (info) => {
    const version = info?.version ?? '';
    sendUpdaterMessage({
      status: 'downloaded',
      text: version
        ? `Güncelleme (${version}) indirildi. Kurulum için yeniden başlatın.`
        : 'Güncelleme indirildi. Kurulum için yeniden başlatın.',
      version,
    });
  });

  let updateCheckDone = false;
  win.webContents.on('did-finish-load', () => {
    if (updateCheckDone) return;
    try {
      const url = win.webContents.getURL();
      if (!url.startsWith(APP_ORIGIN)) return;
      updateCheckDone = true;
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        logLine(`checkForUpdatesAndNotify failed: ${err && err.stack ? err.stack : err}`);
      });
    } catch {
      /* ignore */
    }
  });
}

ipcMain.on('restart-and-install', () => {
  autoUpdater.quitAndInstall();
});



function createWindow() {

  mainWindow = new BrowserWindow({

    width: 1280,

    height: 860,

    minWidth: 900,

    minHeight: 600,

    backgroundColor: '#0f172a',

    title: 'Fon Takip Programı',

    autoHideMenuBar: true,

    webPreferences: {

      preload: path.join(__dirname, 'preload.js'),

      contextIsolation: true,

      nodeIntegration: false,

    },

  });



  setupAutoUpdater(mainWindow);

  attachWindowOpenHandler(mainWindow);

  mainWindow.loadURL(LOADING_HTML);



  waitForServer()

    .then(() => mainWindow && mainWindow.loadURL(`${APP_ORIGIN}/`))

    .catch((err) => {

      dialog.showErrorBox('Başlatma hatası', String(err && err.message ? err.message : err));

    });



  mainWindow.on('closed', () => {

    mainWindow = null;

  });

}



// Single-instance: focus the existing window instead of starting a second server.

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {

  app.quit();

} else {

  app.on('second-instance', () => {

    if (mainWindow) {

      if (mainWindow.isMinimized()) mainWindow.restore();

      mainWindow.focus();

    }

  });



  app.whenReady().then(() => {

    ensureDatabase();

    try {

      startServer();

    } catch (err) {

      logLine(`startServer threw: ${err && err.stack ? err.stack : err}`);

      dialog.showErrorBox('Sunucu başlatılamadı', String(err && err.message ? err.message : err));

    }

    createWindow();



    app.on('activate', () => {

      if (BrowserWindow.getAllWindows().length === 0) createWindow();

    });

  });



  app.on('window-all-closed', () => {

    app.quit();

  });

}


