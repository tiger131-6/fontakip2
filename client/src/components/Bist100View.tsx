import { useCallback, useMemo, useState } from 'react';
import ViewHeader from './ViewHeader';
import {
  fetchBist100Quotes,
  type Bist100StockRow,
} from '../utils/bist100';

const STORAGE_KEY = 'bist100_cache';

interface Bist100Cache {
  rows: Bist100StockRow[];
  fetchedAt: string;
  source: 'proxy' | 'direct';
}

function readCache(): Bist100Cache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Bist100Cache;
    if (!Array.isArray(parsed.rows) || !parsed.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: Bist100Cache): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function changePctClass(row: Bist100StockRow): string {
  if (row.changePctNum > 0) return 'text-emerald-700 bg-emerald-50';
  if (row.changePctNum < 0) return 'text-rose-700 bg-rose-50';
  return 'text-slate-600 bg-slate-100';
}

function formatChangePctDisplay(row: Bist100StockRow): string {
  const text = row.changePct.trim();
  if (!text) return '0,00';
  if (text.startsWith('+') || text.startsWith('-')) return text;
  if (row.changePctNum > 0) return `+${text}`;
  return text;
}

const COLUMNS: Array<{ key: keyof Bist100StockRow | 'ticker'; label: string; align: 'left' | 'right' }> = [
  { key: 'ticker', label: 'HİSSE', align: 'left' },
  { key: 'last', label: 'SON', align: 'right' },
  { key: 'buy', label: 'ALIŞ', align: 'right' },
  { key: 'sell', label: 'SATIŞ', align: 'right' },
  { key: 'changePct', label: '% FARK', align: 'right' },
  { key: 'low', label: 'EN DÜŞÜK', align: 'right' },
  { key: 'high', label: 'EN YÜKSEK', align: 'right' },
  { key: 'vwap', label: 'AOF', align: 'right' },
  { key: 'volumeLot', label: 'HACİM (LOT)', align: 'right' },
  { key: 'volumeTl', label: 'HACİM (TL)', align: 'right' },
  { key: 'lastTradeTime', label: 'SON İŞLEM', align: 'right' },
];

export default function Bist100View() {
  const initial = readCache();
  const [rows, setRows] = useState<Bist100StockRow[]>(initial?.rows ?? []);
  const [fetchedAt, setFetchedAt] = useState<string | null>(initial?.fetchedAt ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((row) => row.ticker.includes(q));
  }, [rows, searchQuery]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBist100Quotes();
      setRows(result.rows);
      setFetchedAt(result.fetchedAt);
      writeCache({
        rows: result.rows,
        fetchedAt: result.fetchedAt,
        source: result.source,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'BIST 100 verisi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  const statusText = fetchedAt
    ? searchQuery.trim()
      ? `Son güncelleme: ${formatFetchedAt(fetchedAt)} · ${filteredRows.length} / ${rows.length} hisse`
      : `Son güncelleme: ${formatFetchedAt(fetchedAt)} · ${rows.length} hisse`
    : 'Henüz veri çekilmedi — "Verileri Güncelle" ile Mynet\'ten yükleyin.';

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <ViewHeader
        title="BIST 100 Hisseleri"
        subtitle="Mynet Canlı Borsa (XU100) — otomatik yenileme yok; yalnızca manuel güncelleme."
        actions={
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? 'Güncelleniyor…' : 'Verileri Güncelle'}
          </button>
        }
      />

      <p className="mb-4 text-xs text-slate-500">{statusText}</p>

      {error && (
        <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      )}

      {rows.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-sm font-semibold text-slate-600">BIST 100 tablosu boş.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            Verileri görmek için yukarıdaki &quot;Verileri Güncelle&quot; düğmesine tıklayın.
            Kaynak: finans.mynet.com/borsa/canliborsa (#XU100).
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchQuery('');
                }}
                placeholder="Hisse kodu ara (örn. THYAO, ASELS)…"
                aria-label="Hisse kodu ara"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 font-mono text-sm uppercase shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Temizle
              </button>
            )}
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="text-sm font-semibold text-slate-600">
                &quot;{searchQuery.trim()}&quot; ile eşleşen hisse bulunamadı.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Aramayı temizle
              </button>
            </div>
          ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[calc(100vh-220px)] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.label}
                      className={`whitespace-nowrap px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRows.map((row) => (
                  <tr key={row.ticker} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-sm font-bold text-indigo-700">
                      {row.ticker}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold text-slate-800 tabular-nums">
                      {row.last}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-700 tabular-nums">
                      {row.buy}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-700 tabular-nums">
                      {row.sell}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <span
                        className={`inline-block min-w-[4.5rem] rounded px-2 py-0.5 font-mono font-bold tabular-nums ${changePctClass(row)}`}
                      >
                        {formatChangePctDisplay(row)}%
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                      {row.low}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                      {row.high}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                      {row.vwap}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                      {row.volumeLot}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                      {row.volumeTl}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-slate-500 tabular-nums">
                      {row.lastTradeTime}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          )}
        </>
      )}
    </div>
  );
}
