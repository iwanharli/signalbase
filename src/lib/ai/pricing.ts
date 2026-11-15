// Harga resmi DeepSeek (api-docs.deepseek.com, 16 Nov 2026), USD per 1 juta token, dirata-rata dengan anggapan ±20%
// panggilan di jam sibuk (harga penuh; jam sepi = setengahnya).
//   deepseek-v4-pro: cache 0,022/0,044 · input 0,66/1,32 · output 1,98/3,96
//   deepseek-flash : cache 0,003/0,006 · input 0,15/0,30 · output 0,60/1,20
// deepseek-chat tidak lagi tercantum; dianggap setara deepseek-flash. Model lain: harga dari Pengaturan AI (fallback).
// shortcut: harga tetap di kode, pindahkan ke pengaturan bila sering berubah.
export type Price = { input: number; cached: number; output: number };

const FLASH: Price = { input: 0.18, cached: 0.0036, output: 0.72 };
const PRO: Price = { input: 0.79, cached: 0.026, output: 2.38 };
const MODELS: Record<string, Price> = { "deepseek-chat": FLASH, "deepseek-flash": FLASH, "deepseek-v4-flash": FLASH, "deepseek-v4-pro": PRO };

export const priceFor = (model: string, fallback: Price): Price => MODELS[model] ?? fallback;

/** Biaya USD dari token; `cached` adalah bagian dari `input`. */
export const tokenCost = (t: { input: number; cached?: number; output: number }, p: Price) =>
  ((t.input - (t.cached ?? 0)) * p.input + (t.cached ?? 0) * p.cached + t.output * p.output) / 1_000_000;

/** Perkiraan sebulan penuh: rata-rata hari-hari penuh terakhir (maks. 7, sebelum hari ini) × jumlah hari bulan berjalan. */
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
