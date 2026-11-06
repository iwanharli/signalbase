import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { bankOptions, isType } from "@/lib/server/bank";

export const GET = adminRoute(async (_req: Request, { params }: { params: Promise<{ type: string }> }) => {
  const { type } = await params;
  if (!isType(type)) return NextResponse.json({ error: "Jenis tidak dikenal" }, { status: 404 });
  try {
    return NextResponse.json(await bankOptions(type));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
