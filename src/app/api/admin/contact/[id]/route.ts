import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// Admin only: mark an enquiry handled or open again.
export const PATCH = adminRoute(async (req: Request, { params }: Context) => {
  const parsed = z.object({ handled: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  const { count } = await prisma.contactRequest.updateMany({ where: { id: (await params).id }, data: { handled: parsed.data.handled } });
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
});
