import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { revokeAccessKey, rotateAccessKey } from "@/lib/server/projectAccess";

type Context = { params: Promise<{ id: string; keyId: string }> };

const bodySchema = z.object({ action: z.enum(["rotate", "revoke"]) });

// Admin only: the client's key for one project. rotate = a new key (the old one stops at once; also re-enables a revoked
// key); revoke = the key stops, the client still sees the project in the panel.
export const POST = adminRoute(async (req: Request, { params }: Context) => {
  const { id, keyId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  const member = await prisma.projectMember.findUnique({ where: { apiKeyId_accountId: { apiKeyId: keyId, accountId: id } }, select: { accountId: true } });
  if (!member) return NextResponse.json({ error: "Klien ini belum diberi proyek tersebut" }, { status: 404 });
  if (parsed.data.action === "rotate") await rotateAccessKey(keyId, id);
  else await revokeAccessKey(keyId, id);
  return NextResponse.json({ ok: true });
});
