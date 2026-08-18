import { apiUrl } from '../config/apiBase';

/**
 * Fetch a TEFAS mutual fund's daily % return via the bundled Express proxy
 * (official TEFAS JSON API — last two NAV rows). Returns 0 when unavailable.
 */
export async function fetchTefasFundDailyChange(fundCode: string): Promise<number> {
  const code = fundCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return 0;

  try {
    const response = await fetch(
      apiUrl(`/market/tefas-daily-change/${encodeURIComponent(code)}`),
      { method: 'GET', headers: { Accept: 'application/json' } }
    );

    if (!response.ok) return 0;

    const data = (await response.json()) as { dailyChange?: unknown };
    const change = Number(data.dailyChange);
    if (!Number.isFinite(change)) return 0;
    return Math.round(change * 100) / 100;
  } catch (error) {
    console.error(`TEFAS fetch failed for fund ${code}:`, error);
    return 0;
  }
}
