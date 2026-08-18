/**
 * Seed funds.db with the 1014 funds and their tax classification.
 *
 * Source of truth:
 *   - Fund codes + names: the original KAP CSV export.
 *   - Tax status: derived from KAP's official fund title (Fon Tam Ünvanı).
 *     A fund is tax-free (is_tax_free = 1) when its official title contains
 *     the phrase "hisse senedi yoğun fon".
 *
 * We fetch KAP's bulk fund-list endpoints (a handful of requests, spaced out),
 * exactly like the standalone classifier — NOT one request per fund.
 *
 * Usage:
 *   npm run seed                       # auto-detects the CSV near the project
 *   npm run seed -- "C:\\path\\to.csv"  # explicit CSV path
 *   CSV_PATH=... npm run seed
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import db from './db';

const TAX_FREE_PHRASE = 'hisse senedi yoğun fon';
const KAP_BASE_URL = 'https://www.kap.org.tr';
const FUND_LIST_URL = `${KAP_BASE_URL}/tr/api/fund/criteria`;
const FUND_GROUPS = ['YF', 'BYF', 'YYF', 'EYF', 'OKS'];
const FUND_STATUSES: Array<'Y' | 'T'> = ['Y', 'T'];
/** Delay between KAP requests (ms). Override with KAP_DELAY_MS. */
const KAP_DELAY_MS = Number(process.env.KAP_DELAY_MS) || 1500;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function normalizeTr(s: string): string {
  return s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function resolveCsvPath(): string {
  const explicit = process.argv[2] || process.env.CSV_PATH;
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);

  const candidateDirs = [
    process.cwd(),
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..'),
    path.join(__dirname, '..', '..', '..'),
  ];

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const csvs = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
    // Prefer a file that looks like the KAP fund export.
    const preferred = csvs.find((f) => /fon/i.test(f)) || csvs[0];
    if (preferred) return path.join(dir, preferred);
  }

  throw new Error(
    'CSV bulunamadı. Yol belirtin: npm run seed -- "C:\\\\tam\\\\yol\\\\dosya.csv"'
  );
}

interface CsvFund {
  code: string;
  name: string;
}

function readCsvFunds(csvPath: string): CsvFund[] {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^"?Fon Kodu"?\s*,/.test(line.trim()));
  if (headerIndex === -1) {
    throw new Error('CSV içinde "Fon Kodu" başlık satırı bulunamadı.');
  }
  const body = lines.slice(headerIndex).join('\n');
  const records: Record<string, string>[] = parse(body, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  });

  const funds: CsvFund[] = [];
  for (const rec of records) {
    const code = (rec['Fon Kodu'] || '').trim();
    const name = (rec['Fon Adı'] || '').trim();
    if (code) funds.push({ code, name });
  }
  return funds;
}

interface KapFundRow {
  fundCode?: string | null;
  fundName?: string | null;
  fundState?: string | null;
}

async function buildKapTitleMap(): Promise<Map<string, string>> {
  const http = axios.create({
    timeout: 30000,
    headers: {
      Origin: KAP_BASE_URL,
      Referer: `${KAP_BASE_URL}/tr/bildirim-sorgu`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    },
  });

  const map = new Map<string, string>();
  let count = 0;
  const total = FUND_GROUPS.length * FUND_STATUSES.length;

  for (const group of FUND_GROUPS) {
    for (const status of FUND_STATUSES) {
      if (count > 0) await sleep(KAP_DELAY_MS);
      count += 1;
      const url = `${FUND_LIST_URL}/${group}/${status}`;
      try {
        const { data } = await http.get<KapFundRow[]>(url);
        const rows = Array.isArray(data) ? data : [];
        let added = 0;
        for (const row of rows) {
          const code = (row.fundCode || '').trim().toUpperCase();
          const title = (row.fundName || '').trim();
          if (code && title && !map.has(code)) {
            map.set(code, title);
            added += 1;
          }
        }
        console.log(`[KAP ${count}/${total}] ${group}/${status}: ${rows.length} kayıt (+${added}). Toplam ${map.size}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[KAP ${count}/${total}] ${group}/${status}: HATA -> ${msg}. Devam ediliyor...`);
      }
    }
  }
  return map;
}

async function main() {
  const csvPath = resolveCsvPath();
  console.log(`CSV: ${csvPath}`);
  const funds = readCsvFunds(csvPath);
  console.log(`CSV'den ${funds.length} fon okundu.\n`);

  console.log('KAP resmi ünvanları indiriliyor...');
  const kapMap = await buildKapTitleMap();
  console.log(`\nKAP haritası: ${kapMap.size} fon.\n`);

  const upsert = db.prepare(
    'INSERT OR REPLACE INTO funds (fund_code, fund_name, is_tax_free) VALUES (?, ?, ?)'
  );

  let taxFree = 0;
  let notFound = 0;

  // Wrap the whole import in a single transaction for speed.
  const importAll = db.transaction((items: CsvFund[]) => {
    for (const f of items) {
      const code = f.code.trim().toUpperCase();
      const kapTitle = kapMap.get(code);
      if (!kapTitle) notFound += 1;
      const isTaxFree = kapTitle ? normalizeTr(kapTitle).includes(TAX_FREE_PHRASE) : false;
      if (isTaxFree) taxFree += 1;
      // Prefer the official KAP title when available, else fall back to CSV name.
      upsert.run(code, kapTitle || f.name, isTaxFree ? 1 : 0);
    }
  });

  importAll(funds);

  console.log('================ SEED ÖZET ================');
  console.log(`Eklenen/güncellenen fon : ${funds.length}`);
  console.log(`Vergisiz (tax-free)     : ${taxFree}`);
  console.log(`Vergili                 : ${funds.length - taxFree}`);
  console.log(`KAP'ta bulunamayan      : ${notFound}`);
  console.log('==========================================');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed hatası:', err);
    process.exit(1);
  });
