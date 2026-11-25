import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sortLabels } from "@/lib/media/manualLabels";
import { isMediaType } from "@/lib/media/types";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  type: z.string().refine(isMediaType),
  code: z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/),
  /** One of the project's choices, or null to clear every label of the item. */
  label: z.string().nullable(),
  /** Put the label on, or take it off. One label per request, so two people labelling a post don't undo each other. */
  on: z.boolean().default(true),
});

// Label one post or article within this project. Owners, admins and sub-accounts the project is shared with may label
// (adminRoute lets sub-accounts through for this path only); viewers are read-only. Answers with the item's labels.
export const PUT = adminRoute(async (req: Request, { params }: Context, username) => {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data label tidak valid" }, { status: 400 });
  const { type, code, label, on } = parsed.data;
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { manualLabels: true, revokedAt: true } });
  if (!key) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ error: "Proyek sudah dicabut" }, { status: 409 });
  const item = { apiKeyId: id, type, code };
  const removing = label === null || !on;
  if (!removing && !key.manualLabels.includes(label)) return NextResponse.json({ error: "Label tidak ada di pilihan proyek ini" }, { status: 400 });
  await prisma.$transaction(async (tx) => {
    // First, so the label worker (which takes this row before writing) never adds labels over a person's decision.
    await tx.labelAiItem.upsert({
      where: { apiKeyId_type_code: item }, create: { ...item, status: "human" }, update: { status: "human", retryAfter: null, error: null },
    });
    if (removing) {
      await tx.itemLabel.deleteMany({ where: { ...item, ...(label === null ? {} : { label }) } });
    } else {
      // A person confirming a label takes it over: whatever the AI said about it no longer applies.
      await tx.itemLabel.upsert({
        where: { apiKeyId_type_code_label: { ...item, label } },
        create: { ...item, label, setBy: username },
        update: { source: "human", setBy: username, score: null, additionalData: Prisma.DbNull },
      });
    }
  });
  const rows = await prisma.itemLabel.findMany({ where: item, select: { label: true } });
  return NextResponse.json({ labels: sortLabels(rows, key.manualLabels).map((r) => r.label) });
});
