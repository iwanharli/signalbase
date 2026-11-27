import { NextResponse } from "next/server";
import { z } from "zod";
import { classifierInputSchema, providerLabel } from "@/lib/ai/classifier";
import { keyScopeSchema, parseKeyScope } from "@/lib/media/keyScope";
import { saveClassifier } from "@/lib/server/ai/admin";
import { createKey } from "@/lib/server/apiKey";
import { adminRoute, visibleKeys } from "@/lib/server/auth";
import { aiPlanProblem, providerNotAllowed } from "@/lib/server/ai/providerPolicy";
import { prisma } from "@/lib/server/db";
import { clientActive } from "@/lib/server/projectAccess";

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  scope: keyScopeSchema.default(keyScopeSchema.parse({})),
  /** Optional AI categorisation, set up together with the key. */
  classifier: classifierInputSchema.nullable().default(null),
});

// Lists the projects with their scope. Admins and viewers see all (with their clients); a client only the projects given
// to it, without anything about keys.
export const GET = adminRoute(async (_req: Request, _ctx, _username, user) => {
  const client = user.role === "user";
  const rows = await prisma.project.findMany({
    where: client ? visibleKeys(user.id) : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, prefix: true, keywords: true, scope: true, createdBy: true, createdAt: true, lastUsedAt: true, revokedAt: true, keyEnc: true,
      classifier: { select: { enabled: true, processed: true, lastError: true, providerKind: true, providerBaseUrl: true, providerModel: true } },
      members: { select: { account: { select: { id: true, name: true, status: true, planExpiresAt: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  return NextResponse.json(rows.map(({ scope, keywords, classifier, keyEnc, members, prefix, createdBy, lastUsedAt, ...row }) => ({
    ...row, keywords, scope: parseKeyScope(scope, keywords),
    ...(client ? {} : {
      prefix, createdBy, lastUsedAt, copyable: !!keyEnc,
      clients: members.map((m) => ({ id: m.account.id, name: m.account.name, active: clientActive(m.account) })),
    }),
    classifier: classifier && {
      enabled: classifier.enabled, processed: classifier.processed, lastError: classifier.lastError,
      providerName: `${providerLabel(classifier.providerKind, classifier.providerBaseUrl)} · ${classifier.providerModel}`,
    },
  })));
});

// Creates a project (admins only: clients cannot write) and returns its internal key once.
export const POST = adminRoute(async (req: Request, _ctx, username, user) => {
  const parsed = createKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.path[0] === "name" ? "Nama minimal 2 karakter" : issue?.path[0] === "classifier" ? `Kategorisasi AI: ${issue.message}` : issue?.path[1] === "keywords" ? issue.message : "Parameter cakupan tidak valid";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const scope = {
    ...parsed.data.scope,
    keywords: [...new Set(parsed.data.scope.keywords)],
    provinces: [...new Set(parsed.data.scope.provinces)],
    categories: [...new Set(parsed.data.scope.categories)],
  };
  const blocked = parsed.data.classifier && providerNotAllowed(user, parsed.data.classifier.provider, parsed.data.classifier.fallback);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const planProblem = parsed.data.classifier && await aiPlanProblem(user, parsed.data.classifier);
  if (planProblem) return NextResponse.json({ error: planProblem }, { status: 403 });
  if (parsed.data.classifier && parsed.data.classifier.provider.kind !== "signalbase" && !parsed.data.classifier.provider.apiKey) {
    return NextResponse.json({ error: "Kategorisasi AI: API key penyedia AI wajib diisi" }, { status: 400 });
  }
  const { id, name, prefix, key } = await createKey(parsed.data.name, scope, username);
  if (parsed.data.classifier) await saveClassifier(id, parsed.data.classifier);
  return NextResponse.json({ id, name, prefix, key, scope, classifier: !!parsed.data.classifier });
});
