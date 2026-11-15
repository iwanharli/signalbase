import { NextResponse } from "next/server";
import { apiPreflight, apiRoute } from "@/lib/server/apiKey";
import { prisma } from "@/lib/server/db";

// Pemakaian AI kategorisasi untuk kunci pemanggil, supaya pemiliknya (mis. pbm) bisa menampilkan biayanya sendiri:
//   days     token per hari (WIB) dan model
//   provider model dan 4 huruf terakhir key penyedia AI classifier (null bila kunci tidak memakai kategorisasi)
//   balance  saldo akhir key penyedia per hari (WIB)
//   labels   jumlah post berlabel per hari: lokal (IndoBERT, gratis) atau penyedia AI
//   GET /api/v1/usage?days=30   (1–90)
export const OPTIONS = (req: Request) => apiPreflight(req);

export const GET = apiRoute(async (req, _ctx: unknown, { keyId }) => {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const [rows, classifier, balance, labels] = await Promise.all([
    prisma.$queryRaw<{ day: string; model: string; input: number; output: number; calls: number }[]>`
      select to_char(hour + interval '7 hours', 'YYYY-MM-DD') as day, model,
        sum("inputTokens")::float input, sum("outputTokens")::float output, sum(calls)::int calls
      from "TokenUsage" where "apiKeyId" = ${keyId} and hour >= ${since}
      group by 1, 2 order by 1`,
    prisma.classifier.findUnique({ where: { apiKeyId: keyId }, select: { providerModel: true, providerKeyHint: true } }),
    prisma.$queryRaw<{ day: string; currency: string; total: number }[]>`
      select distinct on (1, 2) to_char(at + interval '7 hours', 'YYYY-MM-DD') as day, currency, total
      from "BalanceSnapshot" where "apiKeyId" = ${keyId} and at >= ${since}
      order by 1, 2, at desc`,
    prisma.$queryRaw<{ day: string; local: boolean; n: number }[]>`
      select to_char("createdAt" + interval '7 hours', 'YYYY-MM-DD') as day, model like 'indobert%' as local, count(*)::int n
      from "Classification" where "apiKeyId" = ${keyId} and "createdAt" >= ${since}
      group by 1, 2 order by 1`,
  ]);
  return NextResponse.json({
    days: rows,
    provider: classifier ? { model: classifier.providerModel, keyHint: classifier.providerKeyHint } : null,
    balance,
    labels,
  }, { headers: { "Cache-Control": "no-store" } });
});
