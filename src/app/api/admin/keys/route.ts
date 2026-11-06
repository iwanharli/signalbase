import { NextResponse } from "next/server";
import { z } from "zod";
import { classifierInputSchema } from "@/lib/ai/classifier";
import { keyScopeSchema, parseKeyScope } from "@/lib/media/keyScope";
import { saveClassifier } from "@/lib/server/ai/admin";
import { createKey } from "@/lib/server/apiKey";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  scope: keyScopeSchema.default(keyScopeSchema.parse({})),
  /** Optional AI categorisation, set up together with the key. */
  classifier: classifierInputSchema.nullable().default(null),
});

// Lists every key with its scope. Only the prefix of each key is known; the full value is never stored.
export const GET = adminRoute(async () => {
  const rows = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, prefix: true, keywords: true, scope: true, createdAt: true, lastUsedAt: true, revokedAt: true,
      classifier: { select: { enabled: true, processed: true, lastError: true, provider: { select: { name: true } } } },
    },
  });
  return NextResponse.json(rows.map(({ scope, keywords, classifier, ...row }) => ({
    ...row, keywords, scope: parseKeyScope(scope, keywords),
    classifier: classifier && { enabled: classifier.enabled, processed: classifier.processed, lastError: classifier.lastError, providerName: classifier.provider.name },
  })));
});

// Creates a key and returns its full value once.
export const POST = adminRoute(async (req: Request) => {
  const parsed = createKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.path[0] === "name" ? "Nama minimal 2 karakter" : issue?.path[0] === "classifier" ? `Kategorisasi AI: ${issue.message}` : "Parameter cakupan tidak valid";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const scope = {
    ...parsed.data.scope,
    keywords: [...new Set(parsed.data.scope.keywords)],
    provinces: [...new Set(parsed.data.scope.provinces)],
    categories: [...new Set(parsed.data.scope.categories)],
  };
  if (parsed.data.classifier && !(await prisma.aiProvider.findUnique({ where: { id: parsed.data.classifier.providerId } }))) {
    return NextResponse.json({ error: "Penyedia AI tidak ditemukan" }, { status: 400 });
  }
  const { id, name, prefix, key } = await createKey(parsed.data.name, scope);
  if (parsed.data.classifier) await saveClassifier(id, parsed.data.classifier);
  return NextResponse.json({ id, name, prefix, key, scope, classifier: !!parsed.data.classifier });
});
