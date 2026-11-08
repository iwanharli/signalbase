import { NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_IDS } from "@/lib/plans";
import { prisma } from "@/lib/server/db";

const schema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
  organization: z.string().trim().min(2, "Nama instansi / perusahaan wajib diisi").max(120),
  email: z.string().trim().email("Email tidak valid").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  plan: z.enum(PLAN_IDS).optional().catch(undefined),
  message: z.string().trim().min(10, "Ceritakan kebutuhan Anda (minimal 10 karakter)").max(3000),
});

// Simple in-memory limit: 5 enquiries per IP per hour.
const recent = new Map<string, number[]>();
const WINDOW = 60 * 60_000;

// Public sales enquiry from /kontak. Stored for admins (Pengguna page); nothing is sent anywhere else.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const hits = (recent.get(ip) ?? []).filter((t) => Date.now() - t < WINDOW);
  if (hits.length >= 5) return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }, { status: 400 });
  recent.set(ip, [...hits, Date.now()]);
  const { phone, plan, ...rest } = parsed.data;
  await prisma.contactRequest.create({ data: { ...rest, phone: phone || null, plan: plan ?? null } });
  return NextResponse.json({ ok: true });
}
