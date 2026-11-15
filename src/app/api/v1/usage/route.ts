import { NextResponse } from "next/server";
import { apiPreflight, apiRoute } from "@/lib/server/apiKey";
import { prisma } from "@/lib/server/db";

// Token AI yang dipakai kategorisasi untuk kunci pemanggil, per hari (WIB) dan model, supaya pemilik kunci bisa
// menghitung biayanya sendiri (mis. pbm, yang memakai akun penyedia AI yang sama).
//   GET /api/v1/usage?days=30   (1–90)
export const OPTIONS = (req: Request) => apiPreflight(req);

export const GET = apiRoute(async (req, _ctx: unknown, { keyId }) => {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const rows = await prisma.$queryRaw<{ day: string; model: string; input: number; output: number; calls: number }[]>`
    select to_char(hour + interval '7 hours', 'YYYY-MM-DD') as day, model,
      sum("inputTokens")::float input, sum("outputTokens")::float output, sum(calls)::int calls
    from "TokenUsage" where "apiKeyId" = ${keyId} and hour >= now() - make_interval(days => ${days})
    group by 1, 2 order by 1`;
  return NextResponse.json({ days: rows }, { headers: { "Cache-Control": "no-store" } });
});
