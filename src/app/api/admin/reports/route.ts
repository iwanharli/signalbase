import { NextResponse } from "next/server";
import { isBrief } from "@/lib/brief";
import { isReportKind, type ReportCover, type ReportKind } from "@/lib/report";
import { adminRoute } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { BANK_SCOPE } from "@/lib/server/report";

const LIMIT = 120;

/** What the newest report says, for the featured card; read from its stored assessment. */
export type LatestBrief = {
  number: string;
  summary: string | null;
  momentum: string | null;
  decisions: { judul: string; tenggat: string }[];
  priorities: string[];
  recipient: string | null;
};

export type ArchiveResponse = {
  scopes: { id: string; name: string }[];
  scope: string | null;
  kind: ReportKind;
  reports: { id: string; start: string; day: string; scopeName: string; cover: ReportCover }[];
  latest: LatestBrief | null;
  /** Whether the scope has a report profile with at least a recipient or institution. */
  profileSet: boolean;
};

// Report archive of one scope and kind (?scope=bank|<project id>&kind=harian|mingguan|bulanan), newest first, with the
// gist of the newest report. Admins: the whole bank and every project; users: their own projects only.
export const GET = adminRoute(async (req: Request, _ctx, _username, user) => {
  const admin = user.role !== "user";
  const params = new URL(req.url).searchParams;
  const keys = await prisma.apiKey.findMany({
    where: admin ? { revokedAt: null } : { ownerId: user.id, revokedAt: null },
    orderBy: { createdAt: "asc" }, select: { id: true, name: true },
  });
  const scopes = [...(admin ? [{ id: BANK_SCOPE, name: "Seluruh data" }] : []), ...keys];
  const requested = params.get("scope");
  const scope = scopes.find((s) => s.id === requested)?.id ?? scopes[0]?.id ?? null;
  const kindParam = params.get("kind");
  const kind: ReportKind = isReportKind(kindParam) ? kindParam : "harian";
  const [rows, profile] = scope
    ? await Promise.all([
      prisma.archivedReport.findMany({ where: { scope, kind }, orderBy: { day: "desc" }, take: LIMIT, select: { id: true, start: true, day: true, scopeName: true, cover: true } }),
      prisma.reportProfile.findUnique({ where: { scope }, select: { recipientTitle: true, institution: true } }),
    ])
    : [[], null];
  // Only the newest snapshot is read whole; the rest of the list needs just the cover.
  const newest = rows[0] ? await prisma.archivedReport.findUnique({ where: { id: rows[0].id }, select: { data: true } }) : null;
  const d = newest?.data;
  const latest: LatestBrief | null = isBrief(d) ? {
    number: d.number,
    summary: d.ai?.suhu.ringkas ?? null,
    momentum: d.ai?.suhu.momentum ?? null,
    decisions: d.ai?.keputusan.isu ?? [],
    priorities: d.ai?.prioritas ?? [],
    recipient: d.profile.recipientTitle || null,
  } : null;
  const body: ArchiveResponse = {
    scopes, scope, kind,
    reports: rows.map((r) => ({ ...r, cover: r.cover as ReportCover })),
    latest,
    profileSet: !!(profile?.recipientTitle || profile?.institution),
  };
  return NextResponse.json(body);
});
