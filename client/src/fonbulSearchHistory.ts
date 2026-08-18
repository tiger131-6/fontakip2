export interface FonbulSearchHistoryEntry {
  fund_code: string;
  fund_name: string;
  searchedAt: string;
}

const STORAGE_KEY = 'fundtrack-fonbul-search-history';
const MAX_ENTRIES = 12;

export function readFonbulSearchHistory(): FonbulSearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is FonbulSearchHistoryEntry =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as FonbulSearchHistoryEntry).fund_code === 'string' &&
          typeof (e as FonbulSearchHistoryEntry).fund_name === 'string' &&
          typeof (e as FonbulSearchHistoryEntry).searchedAt === 'string'
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function writeFonbulSearchHistory(entries: FonbulSearchHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage full or unavailable */
  }
}

export function pushFonbulSearchHistory(
  current: FonbulSearchHistoryEntry[],
  entry: { fund_code: string; fund_name: string }
): FonbulSearchHistoryEntry[] {
  const next: FonbulSearchHistoryEntry[] = [
    { ...entry, fund_code: entry.fund_code.toUpperCase(), searchedAt: new Date().toISOString() },
    ...current.filter((e) => e.fund_code !== entry.fund_code.toUpperCase()),
  ].slice(0, MAX_ENTRIES);
  writeFonbulSearchHistory(next);
  return next;
}

export function clearFonbulSearchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function formatHistoryWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
