/**
 * FundTrack Local — Express API.
 *
 * Routes:
 *   GET  /api/funds                  -> all funds
 *   GET  /api/funds/overview         -> TEFAS table rows (1014) + local tax status
 *   GET  /api/funds/:code/history    -> price history for a fund (newest first)
 *   POST /api/funds/:code/refresh    -> fetch latest TEFAS price, upsert, return history
 *   POST /api/funds/:code/backfill   -> backfill N days of history for one fund
 *   GET  /api/seed/start             -> SSE: full-history sync for ALL funds (live progress)
 *   GET  /api/sync/recent?range=...  -> SSE: günlük/haftalık/aylık bulk price update
 *   POST   /api/watchlist/:code      -> add fund to watchlist
 *   DELETE /api/watchlist/:code      -> remove fund from watchlist
 *   GET  /api/gold/price             -> Yapı Kredi gram altın satış fiyatı (scraped)
 *   GET  /api/market/bist-daily-change/:ticker -> İş Yatırım JSON günlük % değişim
 *   GET  /api/market/tefas-daily-change/:ticker -> TEFAS JSON günlük fon getirisi
 *   GET  /api/market/tefas-historical-change/:ticker?range= -> TEFAS dönemsel getiri
 *   GET  /api/market/tefas-min-purchase/:ticker -> TEFAS min. alım limiti (Tutar/Miktar)
 *   GET  /api/market/bist100                    -> Mynet BIST 100 canlı hisse listesi
 *   GET  /api/market/summary                    -> Yahoo BIST/FX/altın piyasa özeti
 *   GET  /api/portfolio              -> holdings with live P&L
 *   POST /api/portfolio              -> add a buy transaction
 *   DELETE /api/portfolio/:id        -> remove a transaction
 *   GET  /api/backup/export          -> download full DB as JSON
 *   POST /api/backup/import          -> restore DB from JSON backup
 *   GET  /api/fonbul/stats           -> FonBul metrics summary from local DB
 *   GET  /api/fonbul/metrics/:code   -> FonBul metric rows for one fund
 *   GET  /api/fonbul/heatmap         -> Monthly momentum heatmap matrix
 *   GET  /api/fonbul/screener        -> Technical indicators price series (SMA/RSI)
 *   GET  /api/fonbul/scrape-all      -> SSE: FonBul advanced metrics sync (all funds)
 *   GET  /api/health                 -> liveness probe
 */

import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import db, { FundRow, PriceRow } from './db';
import { fetchLatestPrice, fetchPriceHistory } from './tefas';
import {
  runFullHistorySync,
  FULL_HISTORY_START,
  INCREMENTAL_RANGES,
  type IncrementalRange,
} from './seed-history';
import { checkFundList, applyFundList } from './fund-list';
import { getFundOverview } from './fund-overview';
import { fetchGramGoldPrice } from './gold-price';
import { fetchBistDailyChangePercent } from './isyatirim';
import { fetchTefasFundDailyChangePercent, fetchTefasFundHistoricalChangePercent } from './tefas';
import { fetchTefasMinPurchaseInfo } from './tefas-fund-info';
import { fetchMynetBist100 } from './mynet-bist100';
import { fetchMarketSummary } from './yahoo-market-summary';
import {
  getPortfolio,
  getPortfolioHistory,
  clearPortfolioHistory,
  deletePortfolioHistoryEntry,
  addPortfolioEntry,
  deletePortfolioEntry,
} from './portfolio';
import { exportBackup, importBackup } from './backup';
import { runFonbulScrapeAll, getFonbulStats, getFonbulMetrics } from './fonbul';
import { getFonbulHeatmap } from './fonbul-heatmap';
import { getTechnicalScreenerData } from './technical-screener';
import { runCombinedIncrementalSync } from './sync-recent';
import { getDividends, addDividend, deleteDividend } from './dividends';
import { getAlerts, createAlert, updateAlert, deleteAlert } from './alerts';
import { buildPortfolioExcelBuffer } from './export-excel';
import { computeFundCagr } from './fund-cagr';

const GOLD_FUND_CODE = 'ALTIN';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Prepared statements (compiled once for performance) ---
interface FundRowWithFavorite extends FundRow {
  is_favorite: number;
}

const stmtAllFunds = db.prepare<[], FundRowWithFavorite>(`
  SELECT
    f.fund_code,
    f.fund_name,
    f.is_tax_free,
    f.is_active,
    CASE WHEN w.fund_code IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
  FROM funds f
  LEFT JOIN watchlist w ON w.fund_code = f.fund_code
  ORDER BY f.fund_code ASC
`);
const stmtAddWatchlist = db.prepare('INSERT OR IGNORE INTO watchlist (fund_code) VALUES (?)');
const stmtRemoveWatchlist = db.prepare('DELETE FROM watchlist WHERE fund_code = ?');
const stmtFundByCode = db.prepare<[string], FundRow>(
  'SELECT fund_code, fund_name, is_tax_free, is_active FROM funds WHERE fund_code = ?'
);
const stmtHistory = db.prepare<[string], PriceRow>(
  `SELECT id, fund_code, price_date, price, portfolio_value, total_pay_value, total_shares,
          investor_count, active_value, occupancy_rate
   FROM price_history WHERE fund_code = ? ORDER BY price_date DESC`
);
const stmtUpsertPrice = db.prepare(`
  INSERT INTO price_history (fund_code, price_date, price) VALUES (?, ?, ?)
  ON CONFLICT(fund_code, price_date) DO UPDATE SET price = excluded.price
`);

// Bulk upsert wrapped in a single transaction for speed (idempotent thanks to
// the UNIQUE(fund_code, price_date) index).
const backfillTxn = db.transaction((code: string, points: Array<{ date: string; price: number }>) => {
  for (const p of points) stmtUpsertPrice.run(code, p.date, p.price);
});

/** GET /api/funds — all funds with watchlist flag. */
app.get('/api/funds', (_req: Request, res: Response) => {
  const funds = stmtAllFunds.all().map((f) => ({
    fund_code: f.fund_code,
    fund_name: f.fund_name,
    is_tax_free: f.is_tax_free,
    is_active: f.is_active,
    is_favorite: f.is_favorite === 1,
  }));
  res.json(funds);
});

/** POST /api/watchlist/:code — add fund to izleme listesi. */
app.post('/api/watchlist/:code', (req: Request, res: Response) => {
  const code = req.params.code.trim().toUpperCase();
  const fund = stmtFundByCode.get(code);
  if (!fund) {
    return res.status(404).json({ error: `Fon bulunamadı: ${code}` });
  }
  stmtAddWatchlist.run(code);
  res.json({ fund_code: code, is_favorite: true });
});

/** DELETE /api/watchlist/:code — remove fund from izleme listesi. */
app.delete('/api/watchlist/:code', (req: Request, res: Response) => {
  const code = req.params.code.trim().toUpperCase();
  stmtRemoveWatchlist.run(code);
  res.json({ fund_code: code, is_favorite: false });
});

/** GET /api/funds/overview — official TEFAS 1014-fund table with live period returns. */
app.get('/api/funds/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const force = req.query.refresh === '1';
    res.json(await getFundOverview(force));
  } catch (err) {
    next(err);
  }
});

/** GET /api/funds/:code/history — price history ordered newest first. */
app.get('/api/funds/:code/history', (req: Request, res: Response) => {
  const code = req.params.code.trim().toUpperCase();
  const fund = stmtFundByCode.get(code);
  if (!fund) {
    return res.status(404).json({ error: `Fon bulunamadı: ${code}` });
  }
  const history = stmtHistory.all(code);
  res.json({ fund, history });
});

/** POST /api/funds/:code/refresh — pull latest TEFAS price, upsert, return history. */
app.post('/api/funds/:code/refresh', async (req: Request, res: Response, next: NextFunction) => {
  const code = req.params.code.trim().toUpperCase();
  const fund = stmtFundByCode.get(code);
  if (!fund) {
    return res.status(404).json({ error: `Fon bulunamadı: ${code}` });
  }

  try {
    const latest = await fetchLatestPrice(code);
    // Idempotent upsert: same (fund_code, price_date) just overwrites the price.
    stmtUpsertPrice.run(code, latest.date, latest.price);

    const history = stmtHistory.all(code);
    res.json({
      fund,
      latest,
      history,
      message: `${code} fiyatı güncellendi (${latest.date}: ${latest.price}).`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/funds/:code/backfill?days=365
 * Pulls the full daily price history for the last `days` days from TEFAS
 * (chunked), bulk-upserts it, and returns the updated history.
 */
app.post('/api/funds/:code/backfill', async (req: Request, res: Response, next: NextFunction) => {
  const code = req.params.code.trim().toUpperCase();
  const fund = stmtFundByCode.get(code);
  if (!fund) {
    return res.status(404).json({ error: `Fon bulunamadı: ${code}` });
  }

  // Clamp days to a sane range (1 day .. 5 years).
  const days = Math.min(Math.max(Number(req.query.days) || 365, 1), 1825);

  try {
    const { points } = await fetchPriceHistory(code, days);
    backfillTxn(code, points);

    const history = stmtHistory.all(code);
    res.json({
      fund,
      inserted: points.length,
      history,
      message:
        points.length > 0
          ? `${code}: son ${days} günden ${points.length} fiyat kaydı dolduruldu.`
          : `${code}: TEFAS bu aralıkta veri döndürmedi.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/seed/start[?start=YYYY-MM-DD]
 * Server-Sent Events endpoint that runs the full-history sync for ALL funds and
 * streams live progress. Only one sync may run at a time (guarded by a flag).
 *
 * Events emitted:
 *   event: progress  data: { current, total, status, currentRange, kind, inserted, fundsWithData, message? }
 *   event: done      data: { completed, stopped, inserted, fundsWithData, total, current, startDate }
 *   event: error     data: { message }
 */
let syncActive = false;

/** EventSource clients cannot read JSON error bodies — always reply with an SSE error event. */
function sendSseError(res: Response, message: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
  res.end();
}

function beginSseSync(
  req: Request,
  res: Response,
  run: (send: (event: string, data: unknown) => void, shouldStop: () => boolean) => Promise<unknown>
): void {
  if (syncActive) {
    sendSseError(res, 'Başka bir senkronizasyon zaten çalışıyor.');
    return;
  }
  syncActive = true;

  // --- SSE handshake ---
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable proxy/nginx buffering so events flush immediately.
    'X-Accel-Buffering': 'no',
  });
  // Keep the long-lived connection open for the whole (~15 min) job.
  req.socket.setTimeout(0);
  res.flushHeaders?.();
  // Hint the client's reconnect delay (we close cleanly on 'done', so this is a safety net).
  res.write('retry: 10000\n\n');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let clientGone = false;
  req.on('close', () => {
    clientGone = true;
  });

  // Heartbeat comment every 15s guards against idle-connection drops between
  // the (already frequent) progress events.
  const heartbeat = setInterval(() => {
    if (!clientGone) res.write(': ping\n\n');
  }, 15000);

  void (async () => {
    try {
      const result = await run(
        (event, data) => {
          if (!clientGone) send(event, data);
        },
        () => clientGone
      );
      if (!clientGone) send('done', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Senkronizasyon hatası';
      console.error('[SYNC ERROR]', message);
      if (!clientGone) send('error', { message });
    } finally {
      clearInterval(heartbeat);
      syncActive = false;
      res.end();
    }
  })();
}

app.get('/api/seed/start', (req: Request, res: Response) => {
  const startDate = typeof req.query.start === 'string' ? req.query.start : FULL_HISTORY_START;
  beginSseSync(req, res, async (send, shouldStop) =>
    runFullHistorySync({
      startDate,
      onProgress: (p) => send('progress', p),
      shouldStop,
    })
  );
});

/** SSE: günlük (bugün) / haftalık (7g) / aylık (28g) — tüm aktif fonlar, bugüne kadar. */
app.get('/api/sync/status', (_req: Request, res: Response) => {
  res.json({ syncActive, fonbulSyncActive });
});

app.get('/api/sync/recent', (req: Request, res: Response) => {
  const range = req.query.range as string;
  if (!range || !(range in INCREMENTAL_RANGES)) {
    sendSseError(res, 'Geçersiz aralık. daily, weekly veya monthly kullanın.');
    return;
  }

  beginSseSync(req, res, async (send, shouldStop) => {
    const skipFonbul = req.query.skipFonbul === '1' || req.query.skipFonbul === 'true';
    const skipTefas = req.query.skipTefas === '1' || req.query.skipTefas === 'true';
    return runCombinedIncrementalSync({
      range: range as IncrementalRange,
      onProgress: (p) => send('progress', p),
      shouldStop,
      skipFonbul,
      skipTefas,
    });
  });
});

/**
 * GET /api/funds/check — read-only reconciliation against TEFAS.
 * Returns { added, missing, tefasCount, dbCount } without modifying the DB.
 */
app.get('/api/funds/check', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await checkFundList());
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/funds/apply — commit the reconciliation: add new funds and flip
 * is_active for present/missing funds. Never deletes funds or price history.
 */
app.post('/api/funds/apply', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await applyFundList();
    res.json({
      ...result,
      message: `${result.added} yeni fon eklendi, ${result.deactivated} fon pasife alındı, ${result.reactivated} fon yeniden aktifleştirildi.`,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/gold/price — scrape Yapı Kredi gram altın satış fiyatı. */
app.get('/api/gold/price', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quote = await fetchGramGoldPrice({ forceRefresh: req.query.refresh === '1' });
    res.json(quote);
  } catch (err) {
    next(err);
  }
});

/** GET /api/market/bist-daily-change/:ticker — İş Yatırım HisseTekil JSON proxy. */
app.get(
  '/api/market/bist-daily-change/:ticker',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
      if (!ticker) {
        res.status(400).json({ error: 'Hisse kodu gerekli.' });
        return;
      }
      const dailyChange = await fetchBistDailyChangePercent(ticker);
      res.json({ ticker, dailyChange });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/market/tefas-daily-change/:ticker — TEFAS fund daily return proxy. */
app.get(
  '/api/market/tefas-daily-change/:ticker',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(ticker)) {
        res.status(400).json({ error: 'Geçerli bir 3 harfli fon kodu gerekli.' });
        return;
      }
      const dailyChange = await fetchTefasFundDailyChangePercent(ticker);
      res.json({ ticker, dailyChange });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/market/tefas-min-purchase/:ticker — TEFAS min. alım limiti (Tutar + Miktar). */
app.get(
  '/api/market/tefas-min-purchase/:ticker',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9]{2,5}$/.test(ticker)) {
        res.status(400).json({ error: 'Geçerli bir fon kodu gerekli.' });
        return;
      }
      const info = await fetchTefasMinPurchaseInfo(ticker);
      res.json({ ticker, ...info });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/market/bist100 — Mynet Canlı Borsa BIST 100 list (manual refresh). */
app.get('/api/market/bist100', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await fetchMynetBist100();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.json({ rows, count: rows.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/market/summary — Yahoo Finance BIST 100, USD/TRY, EUR/TRY, ONS altın. */
app.get('/api/market/summary', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await fetchMarketSummary();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

/** GET /api/market/tefas-historical-change/:ticker?range= — TEFAS period return proxy. */
app.get(
  '/api/market/tefas-historical-change/:ticker',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
      const range = String(req.query.range ?? '1mo').trim();
      if (!/^[A-Z]{3}$/.test(ticker)) {
        res.status(400).json({ error: 'Geçerli bir 3 harfli fon kodu gerekli.' });
        return;
      }
      const historicalChange = await fetchTefasFundHistoricalChangePercent(ticker, range);
      res.json({ ticker, range, historicalChange });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/portfolio — all transactions with latest price & P&L. */
app.get('/api/portfolio', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getPortfolio());
  } catch (err) {
    next(err);
  }
});

/** GET /api/portfolio/history — archived buy/sell ledger with realized P&L. */
app.get('/api/portfolio/history', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getPortfolioHistory());
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/portfolio/history — wipe the transaction ledger (active holdings unchanged). */
app.delete('/api/portfolio/history', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = clearPortfolioHistory();
    res.json({ deleted });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/portfolio/history/:id — remove one ledger row. */
app.delete('/api/portfolio/history/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Geçersiz kayıt kimliği.' });
      return;
    }
    if (!deletePortfolioHistoryEntry(id)) {
      res.status(404).json({ error: 'İşlem geçmişi kaydı bulunamadı.' });
      return;
    }
    res.json(getPortfolioHistory());
  } catch (err) {
    next(err);
  }
});

/** POST /api/portfolio — record a fund or gold purchase. */
app.post('/api/portfolio', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fund_code = String(req.body?.fund_code ?? '')
      .trim()
      .toUpperCase();
    const buy_date = String(req.body?.buy_date ?? '').trim();
    const buy_price = Number(req.body?.buy_price);
    const quantity = Number(req.body?.quantity);

    if (!fund_code) {
      res.status(400).json({ error: 'Fon kodu gerekli.' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(buy_date)) {
      res.status(400).json({ error: 'Alım tarihi YYYY-MM-DD formatında olmalı.' });
      return;
    }
    if (!Number.isFinite(buy_price) || buy_price <= 0) {
      res.status(400).json({ error: 'Geçerli bir alış fiyatı girin.' });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      res.status(400).json({ error: 'Geçerli bir adet girin.' });
      return;
    }

    if (fund_code !== GOLD_FUND_CODE) {
      const fund = stmtFundByCode.get(fund_code);
      if (!fund) {
        res.status(404).json({ error: `Fon bulunamadı: ${fund_code}` });
        return;
      }
    }

    const holding = await addPortfolioEntry({ fund_code, buy_date, buy_price, quantity });
    res.status(201).json({ holding, portfolio: await getPortfolio() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/dividends — dividend ledger. */
app.get('/api/dividends', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getDividends());
  } catch (err) {
    next(err);
  }
});

/** POST /api/dividends — log a cash dividend. */
app.post('/api/dividends', (req: Request, res: Response, next: NextFunction) => {
  try {
    const fund_code = String(req.body?.fund_code ?? '').trim().toUpperCase();
    const amount_tl = Number(req.body?.amount_tl);
    const date = String(req.body?.date ?? '').trim();
    if (!fund_code) {
      res.status(400).json({ error: 'Fon kodu gerekli.' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Tarih YYYY-MM-DD formatında olmalı.' });
      return;
    }
    if (!Number.isFinite(amount_tl) || amount_tl <= 0) {
      res.status(400).json({ error: 'Geçerli bir temettü tutarı girin.' });
      return;
    }
    res.status(201).json(addDividend({ fund_code, amount_tl, date }));
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/dividends/:id */
app.delete('/api/dividends/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Geçersiz kayıt kimliği.' });
      return;
    }
    if (!deleteDividend(id)) {
      res.status(404).json({ error: 'Temettü kaydı bulunamadı.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** GET /api/alerts — price alerts. */
app.get('/api/alerts', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getAlerts());
  } catch (err) {
    next(err);
  }
});

/** POST /api/alerts */
app.post('/api/alerts', (req: Request, res: Response, next: NextFunction) => {
  try {
    const fund_code = String(req.body?.fund_code ?? '').trim().toUpperCase();
    const target_price = Number(req.body?.target_price);
    const condition = String(req.body?.condition ?? '').toUpperCase();
    if (!fund_code) {
      res.status(400).json({ error: 'Fon kodu gerekli.' });
      return;
    }
    if (!Number.isFinite(target_price) || target_price <= 0) {
      res.status(400).json({ error: 'Geçerli bir hedef fiyat girin.' });
      return;
    }
    if (condition !== 'ABOVE' && condition !== 'BELOW') {
      res.status(400).json({ error: 'Koşul ABOVE veya BELOW olmalı.' });
      return;
    }
    res.status(201).json(createAlert({ fund_code, target_price, condition }));
  } catch (err) {
    next(err);
  }
});

/** PUT /api/alerts/:id */
app.put('/api/alerts/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const fund_code = String(req.body?.fund_code ?? '').trim().toUpperCase();
    const target_price = Number(req.body?.target_price);
    const condition = String(req.body?.condition ?? '').toUpperCase();
    const is_active = req.body?.is_active;
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Geçersiz kayıt kimliği.' });
      return;
    }
    if (!fund_code || !Number.isFinite(target_price) || target_price <= 0) {
      res.status(400).json({ error: 'Geçersiz uyarı verisi.' });
      return;
    }
    if (condition !== 'ABOVE' && condition !== 'BELOW') {
      res.status(400).json({ error: 'Koşul ABOVE veya BELOW olmalı.' });
      return;
    }
    const updated = updateAlert(id, {
      fund_code,
      target_price,
      condition,
      is_active: typeof is_active === 'boolean' ? is_active : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Uyarı bulunamadı.' });
      return;
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/alerts/:id */
app.delete('/api/alerts/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Geçersiz kayıt kimliği.' });
      return;
    }
    if (!deleteAlert(id)) {
      res.status(404).json({ error: 'Uyarı bulunamadı.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** GET /api/export/excel — multi-sheet portfolio workbook. */
app.get('/api/export/excel', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const buffer = buildPortfolioExcelBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="fundtrack_export.xlsx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/** GET /api/funds/:code/cagr — historical CAGR for simulator. */
app.get('/api/funds/:code/cagr', (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    res.json(computeFundCagr(code));
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/portfolio/:id — remove one transaction. */
app.delete('/api/portfolio/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Geçersiz kayıt kimliği.' });
      return;
    }
    if (!(await deletePortfolioEntry(id))) {
      res.status(404).json({ error: 'Portföy kaydı bulunamadı.' });
      return;
    }
    res.json(await getPortfolio());
  } catch (err) {
    next(err);
  }
});

/** SSE: FonBul portföy / tedavül / yatırımcı metrikleri — tüm fonlar, 2 sn aralık. */
let fonbulSyncActive = false;

function beginSseFonbul(
  req: Request,
  res: Response,
  run: (send: (event: string, data: unknown) => void, shouldStop: () => boolean) => Promise<unknown>
): void {
  if (fonbulSyncActive) {
    sendSseError(res, 'FonBul senkronizasyonu zaten çalışıyor.');
    return;
  }
  fonbulSyncActive = true;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  req.socket.setTimeout(0);
  res.flushHeaders?.();
  res.write('retry: 10000\n\n');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let clientGone = false;
  req.on('close', () => {
    clientGone = true;
  });

  const heartbeat = setInterval(() => {
    if (!clientGone) res.write(': ping\n\n');
  }, 15000);

  void (async () => {
    try {
      const result = await run(
        (event, data) => {
          if (!clientGone) send(event, data);
        },
        () => clientGone
      );
      if (!clientGone) send('done', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'FonBul senkronizasyon hatası';
      console.error('[FONBUL SYNC ERROR]', message);
      if (!clientGone) send('error', { message });
    } finally {
      clearInterval(heartbeat);
      fonbulSyncActive = false;
      res.end();
    }
  })();
}

app.get('/api/fonbul/stats', (_req: Request, res: Response) => {
  res.json(getFonbulStats());
});

app.get('/api/fonbul/metrics/:code', (req: Request, res: Response) => {
  const code = req.params.code.trim().toUpperCase();
  const fund = stmtFundByCode.get(code);
  if (!fund) {
    res.status(404).json({ error: `Fon bulunamadı: ${code}` });
    return;
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const start = typeof req.query.start === 'string' ? req.query.start : undefined;
  const end = typeof req.query.end === 'string' ? req.query.end : undefined;
  const startMonth =
    typeof req.query.startMonth === 'string' ? req.query.startMonth : undefined;
  const endMonth = typeof req.query.endMonth === 'string' ? req.query.endMonth : undefined;
  try {
    const result = getFonbulMetrics(code, page, pageSize, { start, end, startMonth, endMonth });
    res.json({ fund_code: code, fund_name: fund.fund_name, ...result });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Metrikler yüklenemedi.' });
  }
});

app.get('/api/fonbul/heatmap', (req: Request, res: Response) => {
  try {
    const start =
      typeof req.query.start === 'string' ? req.query.start.trim() : '';
    const end = typeof req.query.end === 'string' ? req.query.end.trim() : '';
    if (start && end) {
      res.json(getFonbulHeatmap(start, end));
      return;
    }
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      res.json(getFonbulHeatmap(monthStart, monthEnd));
      return;
    }
    res.status(400).json({ error: 'start ve end (YYYY-MM-DD) veya year ve month gerekli.' });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Isı haritası hesaplanamadı.' });
  }
});

app.get('/api/fonbul/screener', (req: Request, res: Response) => {
  const days = Number(req.query.days) || 90;
  res.json(getTechnicalScreenerData(days));
});

app.get('/api/fonbul/scrape-all', (req: Request, res: Response) => {
  beginSseFonbul(req, res, async (send, shouldStop) =>
    runFonbulScrapeAll({
      onProgress: (p) => send('progress', p),
      shouldStop,
    })
  );
});

/** GET /api/backup/export — download all tables as fundtrack_backup.json */
app.get('/api/backup/export', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = exportBackup();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fundtrack_backup.json"');
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/** POST /api/backup/import — replace all data from JSON backup (transactional) */
app.post('/api/backup/import', (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = importBackup(req.body);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Yedek geri yüklenemedi.';
    if (message.startsWith('Geçersiz yedek')) {
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// In the packaged desktop app the Express server also serves the built React
// client (set via CLIENT_DIST). In dev this is unset and Vite serves the UI.
const clientDist = process.env.CLIENT_DIST;
if (clientDist) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API GET returns index.html so client routing works.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Centralised error handler so a TEFAS failure returns clean JSON, never a crash.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Bilinmeyen sunucu hatası';
  console.error('[API ERROR]', message);
  res.status(502).json({ error: message });
});

const HOST = process.env.HOST || '127.0.0.1';

export function startApi(port = PORT, host = HOST): void {
  app.listen(port, host, () => {
    console.log(`FundTrack Local API çalışıyor: http://${host}:${port}`);
  });
}

if (process.env.FUNDTRACK_DEFER_LISTEN !== '1') {
  startApi();
}
