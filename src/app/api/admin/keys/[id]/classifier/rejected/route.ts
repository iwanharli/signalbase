import { NextResponse } from "next/server";
import { MEDIA_TYPES, type MediaType } from "@/lib/media/types";
import { retryRejected } from "@/lib/server/ai/worker";
import { providerErrorMessage } from "@/lib/server/ai/providers";
import { fetchItemsByCode } from "@/lib/server/bank";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };
type Cursors = Partial<Record<MediaType, { rejected?: string[]; rejectedSince?: number }>>;

// Items the AI provider refused (counted as "Terlewat"), newest first, with a short preview.
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  const classifier = await prisma.classifier.findUnique({ where: { apiKeyId: id }, select: { cursors: true } });
  if (!classifier) return NextResponse.json({ error: "Kunci ini belum memakai kategorisasi AI" }, { status: 404 });
  const cursors = (classifier.cursors ?? {}) as Cursors;
  const lists = await Promise.all(MEDIA_TYPES.map(async (type) => {
    const codes = (cursors[type]?.rejected ?? []).slice(-200).reverse();
    const items = await fetchItemsByCode(type, codes);
    return items.map((i) => ({ type, code: i.code, source: i.source, publishedAt: i.publishedAt, text: [i.title, i.content].filter(Boolean).join(" · ").slice(0, 220) }));
  }));
  const total = MEDIA_TYPES.reduce((n, t) => n + (cursors[t]?.rejected?.length ?? 0), 0);
  return NextResponse.json({ total, items: lists.flat() }, { headers: { "Cache-Control": "no-store" } });
});

// Tries every refused item again right away.
export const POST = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  try {
    return NextResponse.json(await retryRejected(id));
  } catch (error) {
    return NextResponse.json({ error: providerErrorMessage(error) }, { status: 502 });
  }
});
