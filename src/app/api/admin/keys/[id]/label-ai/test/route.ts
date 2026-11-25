import { NextResponse } from "next/server";
import { labelAiTestSchema } from "@/lib/ai/labelAi";
import { validationError } from "@/lib/server/ai/admin";
import { labelAiBlocked, labelAiConfig, LabelAiError, labelAiPlanProblem, storedKeyFor } from "@/lib/server/ai/labelAi";
import { testProvider } from "@/lib/server/ai/testProvider";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { encryptSecret } from "@/lib/server/secrets";

type Context = { params: Promise<{ id: string }> };

const fail = (error: string, status = 200) => NextResponse.json({ ok: false, ms: 0, error }, { status });

// Tests the form's provider with the typed key, or with this project's stored key when the field is empty.
export const POST = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const blocked = await labelAiBlocked(user, id);
  if (blocked) return fail(blocked, 403);
  const parsed = labelAiTestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Data penyedia tidak valid");
  const { provider, model, apiKey } = parsed.data;
  const planProblem = await labelAiPlanProblem(user, model);
  if (planProblem) return fail(planProblem, 403);
  try {
    const enc = apiKey ? encryptSecret(apiKey) : storedKeyFor(await prisma.labelAi.findUnique({ where: { apiKeyId: id } }), provider);
    return testProvider(labelAiConfig(provider, model, enc));
  } catch (error) {
    if (error instanceof LabelAiError) return fail(error.message);
    throw error;
  }
});
