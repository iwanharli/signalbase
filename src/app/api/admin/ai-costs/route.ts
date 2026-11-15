import { NextResponse } from "next/server";
import { monthProjection, priceFor, tokenCost } from "@/lib/ai/pricing";
import { providerBalance } from "@/lib/server/ai/balance";
import { platformKeyHint, platformProvider } from "@/lib/server/ai/platform";
import { getSetting, jakartaDay } from "@/lib/server/ai/summary";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { liveKurs } from "@/lib/server/kurs";

const DAYS = 30;
const PURPOSE: Record<string, string> = { summary: "Ringkasan AI", report: "Laporan", test: "Uji koneksi" };

// Biaya AI yang dibayar key milik Signalbase (SIGNALBASE_AI_API_KEY): AI platform (Ringkasan AI, laporan) dan
// kategorisasi proyek yang memakai key itu. Token yang dibayar key lain (mis. key DeepSeek milik klien seperti KIPERMAS,
// atau dicatat sebelum 16 Nov 2026 tanpa keterangan key) tidak dihitung, hanya dilaporkan jumlahnya.
export const GET = adminRoute(async () => {
  const today = jakartaDay();
  const monthStart = `${today.slice(0, 7)}-01`;
  const since = new Date(Math.min(Date.parse(`${monthStart}T00:00:00+07:00`), Date.parse(`${today}T00:00:00+07:00`) - (DAYS - 1) * 86_400_000));
  const own = platformKeyHint();
  const provider = platformProvider("standard");
  const [setting, kurs, balance, tokens, calls, labels] = await Promise.all([
    getSetting(),
    liveKurs(),
    provider ? providerBalance(provider).catch(() => null) : Promise.resolve(null),
    prisma.$queryRaw<{ day: string; apiKeyId: string; model: string; keyHint: string | null; input: number; output: number; calls: number }[]>`
      select to_char(hour + interval '7 hours', 'YYYY-MM-DD') as day, "apiKeyId", model, "keyHint",
        sum("inputTokens")::float input, sum("outputTokens")::float output, sum(calls)::int calls
      from "TokenUsage" where hour >= ${since} group by 1, 2, 3, 4`,
    prisma.$queryRaw<{ day: string; purpose: string; cost: number; input: number; output: number; calls: number }[]>`
      select to_char(at + interval '7 hours', 'YYYY-MM-DD') as day, purpose,
        sum(cost)::float cost, sum("inputTokens")::float input, sum("outputTokens")::float output, count(*)::int calls
      from "AiUsageLog" where at >= ${since} group by 1, 2`,
    prisma.$queryRaw<{ apiKeyId: string; local: boolean; n: number }[]>`
      select "apiKeyId", model like 'indobert%' as local, count(*)::int n
      from "Classification" where "createdAt" >= ${new Date(`${monthStart}T00:00:00+07:00`)} group by 1, 2`,
  ]);
  const fallback = { input: setting?.priceInput ?? 0.18, cached: setting?.priceCachedInput ?? 0.0036, output: setting?.priceOutput ?? 0.72 };
  const keyIds = [...new Set([...tokens.map((t) => t.apiKeyId), ...labels.map((l) => l.apiKeyId)])];
  const names = new Map((await prisma.apiKey.findMany({ where: { id: { in: keyIds } }, select: { id: true, name: true } })).map((k) => [k.id, k.name]));

  type Row = { day: string; module: string; label: string; cost: number; tokens: number; calls: number };
  const rows: Row[] = [];
  const excluded = { tokens: 0, calls: 0 };
  for (const t of tokens) {
    if (!own || t.keyHint !== own) {
      if (t.day >= monthStart) { excluded.tokens += t.input + t.output; excluded.calls += t.calls; }
      continue;
    }
    rows.push({ day: t.day, module: `kategorisasi:${t.apiKeyId}`, label: `Kategorisasi · ${names.get(t.apiKeyId) ?? "proyek"}`, cost: tokenCost(t, priceFor(t.model, fallback)), tokens: t.input + t.output, calls: t.calls });
  }
  for (const c of calls) rows.push({ day: c.day, module: c.purpose, label: PURPOSE[c.purpose] ?? c.purpose, cost: c.cost, tokens: c.input + c.output, calls: c.calls });

  const perDay: Record<string, number> = {};
  for (const r of rows) perDay[r.day] = (perDay[r.day] ?? 0) + r.cost;
  const month = rows.filter((r) => r.day >= monthStart);
  const modules = [...new Map(rows.map((r) => [r.module, r.label])).entries()].map(([module, label]) => {
    const rs = month.filter((r) => r.module === module);
    return { module, label, calls: rs.reduce((s, r) => s + r.calls, 0), tokens: rs.reduce((s, r) => s + r.tokens, 0), cost: rs.reduce((s, r) => s + r.cost, 0) };
  }).sort((a, b) => b.cost - a.cost);
  const usd = balance?.supported ? balance.balances.find((b) => b.currency === "USD") ?? null : null;
  const firstDay = jakartaDay(new Date(Date.parse(`${today}T00:00:00+07:00`) - (DAYS - 1) * 86_400_000));

  return NextResponse.json({
    today, kurs, keyHint: own, model: provider?.model ?? null,
    saldo: usd ? usd.total : null,
    month: { cost: month.reduce((s, r) => s + r.cost, 0), calls: month.reduce((s, r) => s + r.calls, 0), tokens: month.reduce((s, r) => s + r.tokens, 0) },
    ...monthProjection(perDay, today),
    modules,
    daily: rows.filter((r) => r.day >= firstDay).map(({ day, module, cost }) => ({ day, module, cost })),
    labels: keyIds.map((id) => ({
      project: names.get(id) ?? "proyek",
      local: labels.filter((l) => l.apiKeyId === id && l.local).reduce((s, l) => s + l.n, 0),
      ai: labels.filter((l) => l.apiKeyId === id && !l.local).reduce((s, l) => s + l.n, 0),
    })).filter((l) => l.local + l.ai > 0),
    excluded,
  }, { headers: { "Cache-Control": "no-store" } });
});
