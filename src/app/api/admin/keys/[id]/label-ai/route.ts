import { NextResponse } from "next/server";
import { labelAiSchema, type LabelAiState } from "@/lib/ai/labelAi";
import { validationError } from "@/lib/server/ai/admin";
import { labelAiBlocked, LabelAiError, labelAiPlanProblem, publicLabelAi, saveLabelAi } from "@/lib/server/ai/labelAi";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

// AI labelling settings of one project. The stored provider key is never returned, only its last four characters.
export const GET = adminRoute(async (_req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const blocked = await labelAiBlocked(user, id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const row = await prisma.labelAi.findUnique({ where: { apiKeyId: id } });
  const state: LabelAiState = { saved: row ? publicLabelAi(row) : null };
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
});

export const PUT = adminRoute(async (req: Request, { params }: Context, username, user) => {
  const { id } = await params;
  const blocked = await labelAiBlocked(user, id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const parsed = labelAiSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Pengaturan AI label tidak valid");
  const planProblem = await labelAiPlanProblem(user, parsed.data.model);
  if (planProblem) return NextResponse.json({ error: planProblem }, { status: 403 });
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { revokedAt: true } });
  if (!key || key.revokedAt) return NextResponse.json({ error: "Proyek tidak ditemukan atau sudah dicabut" }, { status: 404 });
  try {
    const state: LabelAiState = { saved: publicLabelAi(await saveLabelAi(id, parsed.data, username)) };
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof LabelAiError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
});
