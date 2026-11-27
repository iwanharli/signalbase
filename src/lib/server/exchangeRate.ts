// 1 USD in Rupiah from open.er-api.com (ExchangeRate-API, free without a key, updated daily), for AI costs.
// Kept 6 hours per process; on failure the last good rate, or null (the caller then uses the rate from the settings).
const TTL = 6 * 3_600_000;
let memo: { at: number; usdToIdr: number } | null = null;

export async function liveUsdToIdr(): Promise<number | null> {
  if (memo && Date.now() - memo.at < TTL) return memo.usdToIdr;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const usdToIdr = res.ok ? ((await res.json()) as { rates?: { IDR?: unknown } }).rates?.IDR : null;
    // A value outside a sensible range means a broken reply.
    if (typeof usdToIdr !== "number" || usdToIdr < 1_000 || usdToIdr > 100_000) return memo?.usdToIdr ?? null;
    memo = { at: Date.now(), usdToIdr: Math.round(usdToIdr) };
    return memo.usdToIdr;
  } catch {
    return memo?.usdToIdr ?? null;
  }
}
