import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FonbulHeatmapResponse, HeatmapTag } from '../types';
import { getFonbulHeatmap, getFunds } from '../api';
import DateRangeField from './DateRangeField';
import { defaultViewerRange, formatDisplayDate, toIso, type DateParts } from '../utils/dateRange';

function formatPct(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPrice(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function cellTooltip(cell: { pct: number; price: number; prevDate: string; prevPrice: number }): string {
  return [
    `Fiyat: ${formatPrice(cell.price)}`,
    `Önceki (${formatDisplayDate(cell.prevDate)}): ${formatPrice(cell.prevPrice)}`,
    `Günlük: %${formatPct(cell.pct)}`,
  ].join('\n');
}

const TAG_CELL: Record<HeatmapTag, string> = {
  yellow: 'bg-yellow-400 text-black',
  blue: 'bg-blue-400 text-black',
  red: 'bg-red-500 text-white',
};

const TAG_ROW: Record<HeatmapTag, string> = {
  yellow: 'bg-yellow-300 text-black font-semibold',
  blue: 'bg-blue-300 text-black font-semibold',
  red: 'bg-red-400 text-white font-semibold',
};

/** VBA macro row stats — computed only across visible favorite funds for that day. */
function assignFavoriteRowTags(
  cells: Array<{ pct: number } | null>,
  visibleColumnIndices: number[]
): Map<number, HeatmapTag | null> {
  const tags = new Map<number, HeatmapTag | null>();
  for (const fundIdx of visibleColumnIndices) {
    tags.set(fundIdx, null);
  }

  const entries: Array<{ fundIdx: number; pct: number }> = [];
  for (const fundIdx of visibleColumnIndices) {
    const cell = cells[fundIdx];
    if (cell != null && Number.isFinite(cell.pct)) {
      entries.push({ fundIdx, pct: cell.pct });
    }
  }
  if (entries.length === 0) return tags;

  const values = entries.map((e) => e.pct);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const avgVal = values.reduce((sum, v) => sum + v, 0) / values.length;

  for (const { fundIdx, pct } of entries) {
    if (pct === maxVal) tags.set(fundIdx, 'yellow');
    else if (pct === minVal) tags.set(fundIdx, 'red');
  }

  let closestFundIdx: number | null = null;
  let closestDiff = Infinity;
  for (const { fundIdx, pct } of entries) {
    if (pct === maxVal || pct === minVal) continue;
    const diff = Math.abs(pct - avgVal);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestFundIdx = fundIdx;
    }
  }
  if (closestFundIdx != null) {
    tags.set(closestFundIdx, 'blue');
  }

  return tags;
}

export default function FonBulHeatmap() {
  const [dateDefaults] = useState(() => defaultViewerRange());
  const [startParts, setStartParts] = useState<DateParts>(dateDefaults.start);
  const [endParts, setEndParts] = useState<DateParts>(dateDefaults.end);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(true);
  const [favoriteFundCodes, setFavoriteFundCodes] = useState<Set<string>>(new Set());
  const [data, setData] = useState<FonbulHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getFunds()
      .then((funds) => {
        setFavoriteFundCodes(new Set(funds.filter((f) => f.is_favorite).map((f) => f.fund_code)));
      })
      .catch(() => setFavoriteFundCodes(new Set()));
  }, []);

  const startIso = useMemo(() => toIso(startParts), [startParts]);
  const endIso = useMemo(() => toIso(endParts), [endParts]);
  const rangeInvalid = startIso > endIso;

  const load = useCallback(async (start: string, end: string) => {
    if (start > end) {
      setError('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await getFonbulHeatmap(start, end));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Isı haritası yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rangeInvalid) return;
    void load(startIso, endIso);
  }, [startIso, endIso, rangeInvalid, load]);

  const visibleColumnIndices = useMemo(() => {
    if (!data) return [];
    const all = data.fundCodes.map((_, idx) => idx);
    if (!showOnlyFavorites) return all;
    return all.filter((idx) => favoriteFundCodes.has(data.fundCodes[idx]));
  }, [data, showOnlyFavorites, favoriteFundCodes]);

  const dailyRows = useMemo(() => {
    if (!data) return [];
    return [...data.rows].sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  /** Favorites-only: per-day tags + Sarı/Kırmızı/Mavi counts from VBA row logic. */
  const favoriteColoring = useMemo(() => {
    if (!data || !showOnlyFavorites || visibleColumnIndices.length === 0) return null;

    const tagsByDate = new Map<string, Map<number, HeatmapTag | null>>();
    const colorCounts = new Map<number, { yellow: number; red: number; blue: number }>();

    for (const fundIdx of visibleColumnIndices) {
      colorCounts.set(fundIdx, { yellow: 0, red: 0, blue: 0 });
    }

    for (const row of data.rows) {
      const rowTags = assignFavoriteRowTags(row.cells, visibleColumnIndices);
      tagsByDate.set(row.date, rowTags);

      for (const [fundIdx, tag] of rowTags) {
        if (!tag) continue;
        const counts = colorCounts.get(fundIdx);
        if (counts) counts[tag] += 1;
      }
    }

    return { tagsByDate, colorCounts };
  }, [data, showOnlyFavorites, visibleColumnIndices]);

  const summaryRows = useMemo(() => {
    if (!data) return [];

    const yellowValues = data.fundCodes.map((_, fundIdx) => {
      if (showOnlyFavorites && favoriteColoring) {
        return favoriteColoring.colorCounts.get(fundIdx)?.yellow ?? 0;
      }
      return data.summary[fundIdx].yellow;
    });
    const redValues = data.fundCodes.map((_, fundIdx) => {
      if (showOnlyFavorites && favoriteColoring) {
        return favoriteColoring.colorCounts.get(fundIdx)?.red ?? 0;
      }
      return data.summary[fundIdx].red;
    });
    const blueValues = data.fundCodes.map((_, fundIdx) => {
      if (showOnlyFavorites && favoriteColoring) {
        return favoriteColoring.colorCounts.get(fundIdx)?.blue ?? 0;
      }
      return data.summary[fundIdx].blue;
    });

    return [
      { key: 'yellow', label: 'Sarı Gün', tag: 'yellow' as HeatmapTag, values: yellowValues },
      { key: 'red', label: 'Kırmızı Gün', tag: 'red' as HeatmapTag, values: redValues },
      { key: 'blue', label: 'Mavi Gün', tag: 'blue' as HeatmapTag, values: blueValues },
    ];
  }, [data, showOnlyFavorites, favoriteColoring]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Isı Haritası</h3>
            <p className="mt-1 text-xs text-slate-500">
              Hücreler günlük % değişimdir (önceki işlem günü fiyatına göre). Fiyat detayı için hücrenin
              üzerine gelin.
              {showOnlyFavorites
                ? ' Favori görünümü: satırda en yüksek sarı, en düşük kırmızı, ortalamaya en yakın mavi.'
                : ' Tüm piyasa: üst %33 sarı, orta %33 mavi, alt %33 kırmızı.'}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeField label="Başlangıç" parts={startParts} onChange={setStartParts} />
            <span className="hidden pb-2 text-slate-400 sm:inline" aria-hidden>
              →
            </span>
            <DateRangeField label="Bitiş" parts={endParts} onChange={setEndParts} />
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Görünüm</label>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setShowOnlyFavorites(false)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                    !showOnlyFavorites
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Tüm Piyasayı Göster
                </button>
                <button
                  type="button"
                  onClick={() => setShowOnlyFavorites(true)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                    showOnlyFavorites
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Sadece Favorilerimi Göster
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load(startIso, endIso)}
              disabled={loading || rangeInvalid}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
            >
              {loading ? 'Yükleniyor…' : 'Yenile'}
            </button>
          </div>
        </div>

        {rangeInvalid && (
          <p className="mt-3 text-xs text-rose-600">
            Başlangıç tarihi bitiş tarihinden sonra olamaz.
          </p>
        )}

        {data && (
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-600">
            <span>
              <strong className="text-slate-800">{data.rangeLabel}</strong>
            </span>
            <span className="font-mono text-slate-500">
              {data.rangeStart} – {data.rangeEnd}
            </span>
            <span>{data.dates.length} işlem günü</span>
            <span>
              {showOnlyFavorites
                ? `${visibleColumnIndices.length} favori fon (${data.fundCodes.length} piyasa)`
                : `${data.fundCodes.length} fon`}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="rounded-xl bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          Isı haritası hesaplanıyor…
        </div>
      )}

      {data && data.fundCodes.length > 0 && showOnlyFavorites && visibleColumnIndices.length === 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          Seçilen dönem için favori listenizdeki fonlardan fiyat verisi bulunamadı. Fonlar sekmesinden favori
          ekleyin veya &quot;Tüm Piyasayı Göster&quot; görünümüne geçin.
        </div>
      )}

      {data && data.fundCodes.length > 0 && visibleColumnIndices.length > 0 && (
        <div className="overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-max min-w-full border-collapse text-sm leading-snug">
              <thead className="sticky top-0 z-20 bg-slate-100">
                <tr>
                  <th className="sticky left-0 z-30 w-[88px] min-w-[88px] max-w-[88px] border border-slate-300 bg-slate-200 px-1.5 py-2 text-left text-xs font-bold text-slate-800">
                    Tarih
                  </th>
                  {visibleColumnIndices.map((fundIdx) => (
                    <th
                      key={data.fundCodes[fundIdx]}
                      title="Günlük % değişim"
                      className="min-w-[64px] border border-slate-300 bg-slate-100 px-1.5 py-2 text-center text-sm font-bold text-slate-700"
                    >
                      <div>{data.fundCodes[fundIdx]}</div>
                      <div className="text-[9px] font-normal text-slate-500">günlük %</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => (
                  <tr key={row.date}>
                    <td
                      title={row.date}
                      className="sticky left-0 z-10 w-[88px] min-w-[88px] max-w-[88px] border border-slate-300 bg-slate-50 px-1.5 py-1.5 font-mono text-xs font-semibold text-slate-700"
                    >
                      {formatDisplayDate(row.date)}
                    </td>
                    {visibleColumnIndices.map((fundIdx) => {
                      const cell = row.cells[fundIdx];
                      let cellClass: string;
                      if (!cell) {
                        cellClass = 'text-slate-300';
                      } else if (showOnlyFavorites && favoriteColoring) {
                        const tag = favoriteColoring.tagsByDate.get(row.date)?.get(fundIdx) ?? null;
                        cellClass = tag ? TAG_CELL[tag] : 'text-slate-800';
                      } else {
                        cellClass = TAG_CELL[cell.tag];
                      }
                      return (
                        <td
                          key={`${row.date}-${data.fundCodes[fundIdx]}`}
                          title={cell ? cellTooltip(cell) : undefined}
                          className={`border border-slate-300 px-1.5 py-1.5 text-center font-mono text-sm tabular-nums ${cellClass}`}
                        >
                          {cell ? `${formatPct(cell.pct)}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {summaryRows.map((sr) => (
                  <tr key={sr.key}>
                    <td
                      className={`sticky left-0 z-10 w-[88px] min-w-[88px] max-w-[88px] border border-slate-300 px-1.5 py-2 text-xs font-semibold leading-tight ${TAG_ROW[sr.tag]}`}
                    >
                      {sr.label}
                    </td>
                    {visibleColumnIndices.map((fundIdx) => {
                      const val = sr.values[fundIdx];
                      return (
                        <td
                          key={`${sr.key}-${data.fundCodes[fundIdx]}`}
                          className={`border border-slate-300 px-1.5 py-2 text-center font-mono text-sm tabular-nums ${TAG_ROW[sr.tag]}`}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.fundCodes.length === 0 && !loading && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          Seçilen dönem için aktif fon fiyat verisi bulunamadı.
        </div>
      )}
    </div>
  );
}
