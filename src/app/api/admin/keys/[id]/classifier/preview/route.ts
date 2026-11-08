import { NextResponse } from "next/server";
import { z } from "zod";
import { categoriesForType, categorySchema, providerSchema } from "@/lib/ai/classifier";
import { allowsType, parseKeyScope } from "@/lib/media/keyScope";
import { listItemsFromCursor } from "@/lib/server/bank";
import { providerConfig, validationError } from "@/lib/server/ai/admin";
import { classifyBatch, providerErrorMessage, type ProviderConfig } from "@/lib/server/ai/providers";
import { adminRoute } from "@/lib/server/auth";
import { providerNotAllowed } from "@/lib/server/ai/providerPolicy";
import { NOT_CONFIGURED, platformProvider } from "@/lib/server/ai/platform";
import { accountPlan } from "@/lib/server/plan";
import { prisma } from "@/lib/server/db";
import { encryptSecret } from "@/lib/server/secrets";

type Context = { params: Promise<{ id: string }> };

const previewSchema = z.object({
  provider: providerSchema,
  prompt: z.string().trim().min(10).max(6000),
  categories: z.array(categorySchema).min(2).max(30),
  onlineCategories: z.array(categorySchema).min(2).max(30).nullable().default(null),
  type: z.enum(["social", "online"]),
  size: z.number().int().min(1).max(20).default(10),
});

const textOf = (i: { title?: string | null; content?: string | null }) => [i.title, i.content].filter(Boolean).join("\n").trim();

// Runs the form's prompt and categories on the newest items in the key's scope. Nothing is stored.
export const POST = adminRoute(async (req: Request, { params }: Context, _username, user) => {
  const { id } = await params;
  const parsed = previewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error, "Data uji tidak valid");
  const input = parsed.data;
  const blocked = providerNotAllowed(user, input.provider);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });

  const key = await prisma.apiKey.findUnique({ where: { id }, include: { classifier: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  const scope = parseKeyScope(key.scope, key.keywords);
  if (!allowsType(scope, input.type)) return NextResponse.json({ error: "Jenis media ini di luar cakupan proyek" }, { status: 400 });

  let config: ProviderConfig;
  const p = input.provider;
  const baseUrl = p.kind === "openai_compatible" ? p.baseUrl : null;
  if (p.kind === "signalbase") {
    if (user.role === "user" && (await accountPlan(user.id)).limits.aiPostsPerMonth === 0) return NextResponse.json({ error: "Paket Anda tidak termasuk kategorisasi AI." }, { status: 403 });
    const platform = platformProvider(p.model);
    if (!platform) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 400 });
    config = platform;
  } else if (p.apiKey) config = { kind: p.kind, baseUrl, model: p.model, apiKeyEnc: encryptSecret(p.apiKey) };
  else if (key.classifier) config = { ...providerConfig(key.classifier), kind: p.kind, baseUrl, model: p.model };
  else return NextResponse.json({ error: "Isi API key penyedia AI dulu" }, { status: 400 });

  const page = await listItemsFromCursor(input.type, scope, "older", null, input.size * 2);
  const items = page.items.filter((i) => textOf(i)).slice(0, input.size);
  if (!items.length) return NextResponse.json({ items: [], ms: 0 });
  const categories = categoriesForType({ categories: input.categories, onlineCategories: input.onlineCategories }, input.type) as typeof input.categories;

  const started = Date.now();
  try {
    const [results, stored] = await Promise.all([
      classifyBatch(config, input.prompt, categories, items.map((i) => ({ id: i.code, text: textOf(i) }))),
      prisma.classification.findMany({ where: { apiKeyId: id, type: input.type, code: { in: items.map((i) => i.code) } }, select: { code: true, category: true } }),
    ]);
    const saved = new Map(stored.map((s) => [s.code, s.category]));
    return NextResponse.json({
      ms: Date.now() - started,
      items: items.map((i) => {
        const r = results.find((x) => x.id === i.code);
        return {
          code: i.code, source: i.source, publishedAt: i.publishedAt, text: textOf(i).slice(0, 400),
          category: r?.category ?? null, confidence: r?.confidence ?? null, reason: r?.reason ?? null, saved: saved.get(i.code) ?? null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: providerErrorMessage(error) }, { status: 502 });
  }
});
