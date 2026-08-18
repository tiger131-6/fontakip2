/**
 * Simple Moving Average over the last `period` closes (prices oldest → newest).
 */
export function calculateSMA(prices: number[], period: number): number | null {
  if (period <= 0 || prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

/**
 * Relative Strength Index over the last `period` daily changes.
 * prices must be chronological (oldest → newest).
 */
export function calculateRSI(prices: number[], period = 14): number | null {
  if (period <= 0 || prices.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const recent = changes.slice(-period);
  let gainSum = 0;
  let lossSum = 0;

  for (const change of recent) {
    if (change > 0) gainSum += change;
    else if (change < 0) lossSum += Math.abs(change);
  }

  const avgGain = gainSum / period;
  const avgLoss = lossSum / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
