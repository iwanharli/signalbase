import { NextResponse } from "next/server";
import { classifierKeyHint, keySince } from "@/lib/server/ai/platform";
import { apiPreflight, apiRoute } from "@/lib/server/apiKey";
import { prisma } from "@/lib/server/db";

// AI categorisation usage of the calling key, so its owner (e.g. pbm) can show its own costs:
//   days     tokens per day (WIB) and model, only those paid by the current provider key
//   provider model and last 4 characters of the classifier's AI provider key (null when the key has no categorisation)
//   balance  the provider key's closing balance per day (WIB), since that key came into use
//   labels   labelled posts per day: local (IndoBERT, free) or the AI provider
//   GET /api/v1/usage?days=30   (1–90)
export const OPTIONS = (req: Request) => apiPreflight(req);

export const GET = apiRoute(async (req, _ctx: unknown, { keyId }) => {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const classifier = await prisma.classifier.findUnique({ where: { projectId: keyId }, select: { providerModel: true, providerKind: true, providerKeyHint: true } });
  const hint = classifier ? classifierKeyHint(classifier) : null;
  // Tokens and balances of other keys (e.g. a key that used to be shared) are left out, so nothing is counted twice.
  const keyFrom = await keySince(keyId, hint);
  const balanceFrom = keyFrom && keyFrom > since ? keyFrom : since;
  const [rows, balance, labels] = await Promise.all([
    prisma.$queryRaw<{ day: string; model: string; input: number; output: number; calls: number }[]>`
      select to_char(hour + interval '7 hours', 'YYYY-MM-DD') as day, model,
        sum("inputTokens")::float input, sum("outputTokens")::float output, sum(calls)::int calls
      from "TokenUsage" where "projectId" = ${keyId} and hour >= ${since} and "keyHint" = ${hint ?? ""}
      group by 1, 2 order by 1`,
    keyFrom ? prisma.$queryRaw<{ day: string; currency: string; total: number }[]>`
      select distinct on (1, 2) to_char(at + interval '7 hours', 'YYYY-MM-DD') as day, currency, total
      from "BalanceSnapshot" where "projectId" = ${keyId} and at >= ${balanceFrom}
      order by 1, 2, at desc` : [],
    prisma.$queryRaw<{ day: string; local: boolean; n: number }[]>`
      select to_char("createdAt" + interval '7 hours', 'YYYY-MM-DD') as day, model like 'indobert%' as local, count(*)::int n
      from "Classification" where "projectId" = ${keyId} and "createdAt" >= ${since}
      group by 1, 2 order by 1`,
  ]);
  return NextResponse.json({
    days: rows,
    provider: classifier ? { model: classifier.providerModel, keyHint: hint } : null,
    balance,
    labels,
  }, { headers: { "Cache-Control": "no-store" } });
});
