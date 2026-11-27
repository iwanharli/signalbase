import { NextResponse } from "next/server";
import { monthProjection, priceFor, tokenCost } from "@/lib/ai/pricing";
import { platformKeyHint } from "@/lib/server/ai/platform";
import { getSetting, jakartaDay } from "@/lib/server/ai/summary";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { liveUsdToIdr } from "@/lib/server/exchangeRate";

type Context = { params: Promise<{ id: string }> };
const DAYS = 30;

// One project's AI costs paid by Signalbase's own key (SIGNALBASE_AI_API_KEY): categorisation (TokenUsage with keyHint =
// that key) and this project's AI summary (AiUsageLog). Tokens paid by other keys (e.g. a client's own DeepSeek key such as
// KIPERMAS', or recorded before 16 Nov 2026 without a key hint) are not counted, only reported as a number.
export const GET = adminRoute(async (_req: Request, { params }: Context, _username, user) => {
  // Signalbase's internal costs: not for client accounts (role user), even for their own project.
  if (user.role === "user") return NextResponse.json({ error: "Khusus admin" }, { status: 403 });
  const { id } = await params;
  const today = jakartaDay();
  const monthStart = `${today.slice(0, 7)}-01`;
  const since = new Date(Math.min(Date.parse(`${monthStart}T00:00:00+07:00`), Date.parse(`${today}T00:00:00+07:00`) - (DAYS - 1) * 86_400_000));
  const own = platformKeyHint();
  const [setting, usdToIdr, tokens, calls, labels] = await Promise.all([
    getSetting(),
    liveUsdToIdr(),
    prisma.$queryRaw<{ day: string; model: string; keyHint: string | null; input: number; output: number; calls: number }[]>`
      select to_char(hour + interval '7 hours', 'YYYY-MM-DD') as day, model, "keyHint",
        sum("inputTokens")::float input, sum("outputTokens")::float output, sum(calls)::int calls
      from "TokenUsage" where "apiKeyId" = ${id} and hour >= ${since} group by 1, 2, 3`,
    prisma.$queryRaw<{ day: string; cost: number; input: number; output: number; calls: number }[]>`
      select to_char(at + interval '7 hours', 'YYYY-MM-DD') as day,
        sum(cost)::float cost, sum("inputTokens")::float input, sum("outputTokens")::float output, count(*)::int calls
      from "AiUsageLog" where scope = ${id} and at >= ${since} group by 1`,
    prisma.$queryRaw<{ local: boolean; n: number }[]>`
      select model like 'indobert%' as local, count(*)::int n
      from "Classification" where "apiKeyId" = ${id} and "createdAt" >= ${new Date(`${monthStart}T00:00:00+07:00`)} group by 1`,
  ]);
  const fallback = { input: setting?.priceInput ?? 0.18, cached: setting?.priceCachedInput ?? 0.0036, output: setting?.priceOutput ?? 0.72 };

  type Row = { day: string; module: "kategorisasi" | "ringkasan"; cost: number; tokens: number; calls: number };
  const rows: Row[] = [];
  const excluded = { tokens: 0, calls: 0 };
  for (const t of tokens) {
    if (!own || t.keyHint !== own) {
      if (t.day >= monthStart) { excluded.tokens += t.input + t.output; excluded.calls += t.calls; }
      continue;
    }
    rows.push({ day: t.day, module: "kategorisasi", cost: tokenCost(t, priceFor(t.model, fallback)), tokens: t.input + t.output, calls: t.calls });
  }
  for (const c of calls) rows.push({ day: c.day, module: "ringkasan", cost: c.cost, tokens: c.input + c.output, calls: c.calls });

  const perDay: Record<string, number> = {};
  for (const r of rows) perDay[r.day] = (perDay[r.day] ?? 0) + r.cost;
  const month = rows.filter((r) => r.day >= monthStart);
  const sum = (rs: Row[], k: "cost" | "tokens" | "calls") => rs.reduce((s, r) => s + r[k], 0);
  const firstDay = jakartaDay(new Date(Date.parse(`${today}T00:00:00+07:00`) - (DAYS - 1) * 86_400_000));

  return NextResponse.json({
    today, usdToIdr, keyHint: own,
    month: { cost: sum(month, "cost"), calls: sum(month, "calls"), tokens: sum(month, "tokens") },
    ...monthProjection(perDay, today),
    modules: (["kategorisasi", "ringkasan"] as const).map((m) => {
      const rs = month.filter((r) => r.module === m);
      return { module: m, calls: sum(rs, "calls"), tokens: sum(rs, "tokens"), cost: sum(rs, "cost") };
    }),
    daily: rows.filter((r) => r.day >= firstDay).map(({ day, module, cost }) => ({ day, module, cost })),
    labels: { local: labels.find((l) => l.local)?.n ?? 0, ai: labels.find((l) => !l.local)?.n ?? 0 },
    excluded,
  }, { headers: { "Cache-Control": "no-store" } });
});
