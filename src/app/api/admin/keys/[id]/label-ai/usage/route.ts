import { NextResponse } from "next/server";
import { usageSeries } from "@/lib/ai/labelAi";
import { priceFor, SEARCH_PRICE, tokenCost } from "@/lib/ai/pricing";
import { providerBalance } from "@/lib/server/ai/balance";
import { labelAiBlocked, labelAiConfig } from "@/lib/server/ai/labelAi";
import { getSetting } from "@/lib/server/ai/summary";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { liveUsdToIdr } from "@/lib/server/exchangeRate";

type Context = { params: Promise<{ id: string }> };
const HOUR = 3_600_000, DAY = 24 * HOUR;
const RANGES: Record<string, number> = { "1": 1, "7": 7, "30": 30, "90": 90 };

// What AI labelling alone used: its own token records, with the cost estimated from model prices. The provider balance
// covers the whole account, so it is shown as such and never used to derive spending. It is not recorded either: the
// balance history belongs to categorisation.
export const GET = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const blocked = await labelAiBlocked(user, id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const days = RANGES[new URL(req.url).searchParams.get("days") ?? "7"] ?? 7;
  const hourly = days === 1;
  // Daily buckets start at midnight in Jakarta (UTC+7).
  const offset = 7 * HOUR, now = Date.now();
  const end = hourly ? Math.ceil(now / HOUR) * HOUR : Math.ceil((now + offset) / DAY) * DAY - offset;
  const from = new Date(end - days * DAY);
  const [row, rows, setting, usdToIdr] = await Promise.all([
    prisma.labelAi.findUnique({ where: { apiKeyId: id } }),
    prisma.labelAiUsage.findMany({ where: { apiKeyId: id, hour: { gte: from } } }),
    getSetting(),
    liveUsdToIdr(),
  ]);
  const fallback = { input: setting?.priceInput ?? 0.18, cached: setting?.priceCachedInput ?? 0.0036, output: setting?.priceOutput ?? 0.72 };
  const series = usageSeries(rows, from, end, hourly, (u) => {
    const price = priceFor(u.model, fallback);
    const check = tokenCost({ input: u.checkInputTokens, cached: u.checkCachedTokens, output: u.checkOutputTokens }, price);
    return [tokenCost({ input: u.inputTokens, cached: u.cachedTokens, output: u.outputTokens }, price) - check, check, u.searches * SEARCH_PRICE];
  });
  let balance: { currency: string; total: number } | null = null;
  if (row) {
    try {
      const live = await providerBalance(labelAiConfig(row.provider, row.model, row.keyEnc));
      if (live.supported) balance = live.balances.find((b) => b.currency === "USD") ?? live.balances[0] ?? null;
    } catch { /* the usage is still worth showing */ }
  }
  return NextResponse.json({
    configured: !!row, currency: "USD", current: null, since: null, bucket: hourly ? "hour" : "day",
    buckets: series.map(({ start, spent, parts, searches }) => ({ start, spent, parts, searches, topUp: 0 })),
    tokens: series.map(({ start, input, output, calls, tokenParts }) => ({ start, input, output, calls, parts: tokenParts })),
    models: [...new Set(rows.map((r) => r.model))], usdToIdr, balance: balance && { currency: balance.currency, total: balance.total },
  }, { headers: { "Cache-Control": "no-store" } });
});
