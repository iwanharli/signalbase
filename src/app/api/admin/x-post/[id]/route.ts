import { NextResponse } from "next/server";
import { isXPostId } from "@/lib/media/xPost";
import { adminRoute } from "@/lib/server/auth";
import { originalXPost } from "@/lib/server/xPost";

type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };

export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id } = await params;
  if (!isXPostId(id)) return NextResponse.json({ error: "ID post X tidak valid" }, { status: 400, headers });
  try {
    const tweet = await originalXPost(id);
    return NextResponse.json({ tweet: tweet ?? null }, { headers });
  } catch {
    return NextResponse.json({ error: "Post asli belum bisa dimuat dari X. Data tersimpan tetap tersedia." }, { status: 502, headers });
  }
});
