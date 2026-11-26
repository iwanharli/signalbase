import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { revealKey } from "@/lib/server/apiKey";

type Context = { params: Promise<{ id: string; keyId: string }> };

// Admin only (viewers are blocked from /api/admin/users): the full value of the client's key for the project, to hand
// over to the client's integration. Clients never see it.
export const GET = adminRoute(async (_req: Request, { params }: Context) => {
  const { id, keyId } = await params;
  const member = await prisma.projectMember.findUnique({ where: { apiKeyId_accountId: { apiKeyId: keyId, accountId: id } }, select: { keyEnc: true, keyRevokedAt: true } });
  if (!member?.keyEnc || member.keyRevokedAt) return NextResponse.json({ error: "Kunci tidak tersedia" }, { status: 404 });
  return NextResponse.json({ key: revealKey(member.keyEnc) });
});
