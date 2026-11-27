// DeepSeek list prices (api-docs.deepseek.com, 16 Nov 2026), USD per 1 million tokens, averaged assuming ±20% of calls at
// peak hours (full price; off-peak = half).
//   deepseek-v4-pro: cache 0,022/0,044 · input 0,66/1,32 · output 1,98/3,96
//   deepseek-flash : cache 0,003/0,006 · input 0,15/0,30 · output 0,60/1,20
// deepseek-chat is no longer listed; treated as deepseek-flash. Other models: prices from the AI settings (fallback).
// shortcut: prices fixed in code; move them to the settings if they change often.
export type Price = { input: number; cached: number; output: number };

const FLASH: Price = { input: 0.18, cached: 0.0036, output: 0.72 };
const PRO: Price = { input: 0.79, cached: 0.026, output: 2.38 };
const MODELS: Record<string, Price> = { "deepseek-chat": FLASH, "deepseek-flash": FLASH, "deepseek-v4-flash": FLASH, "deepseek-v4-pro": PRO };

export const priceFor = (model: string, fallback: Price): Price => MODELS[model] ?? fallback;

/** USD per successful web search with results (api-docs.deepseek.com/quick_start/pricing, 26 Nov 2026: 0.75 per 1,000). */
export const SEARCH_PRICE = 0.75 / 1000;

/** USD cost of tokens; `cached` is part of `input`. */
export const tokenCost = (t: { input: number; cached?: number; output: number }, p: Price) =>
  ((t.input - (t.cached ?? 0)) * p.input + (t.cached ?? 0) * p.cached + t.output * p.output) / 1_000_000;

/** Full-month estimate: mean of the last full days (at most 7, before today) × days in the current month. */
export function monthProjection(perDay: Record<string, number>, today: string) {
  const [y, m] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const recent: number[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
    if (d in perDay) recent.push(perDay[d]);
  }
  const avgDaily = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : null;
  return { avgDaily, projection: avgDaily == null ? null : avgDaily * daysInMonth, basisDays: recent.length, daysInMonth };
}
