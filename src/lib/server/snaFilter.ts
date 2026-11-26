// SNA narrowed to the posts of one issue (IssueCluster, the project's clusters) and/or one label (ItemLabel, manual or AI):
// ?issue=<cluster id>&label=<name> on /api/admin/sna and /api/admin/sna/account. Both belong to the selected project.
import { NextResponse } from "next/server";
import { prisma } from "./db";

export type SnaCodes = { codes: string[]; key: string } | null;

/** The post codes the graph is limited to, null when no filter is set, or an error response. */
export async function snaCodes(q: URLSearchParams, keyId: string | null): Promise<SnaCodes | Response> {
  const issue = q.get("issue")?.trim() || null;
  const label = q.get("label")?.trim() || null;
  if (!issue && !label) return null;
  if (!keyId) return NextResponse.json({ error: "Pilih proyek untuk memakai filter isu atau label" }, { status: 400 });
  let codes: string[] | null = null;
  if (issue) {
    const row = await prisma.issueCluster.findFirst({ where: { id: issue, apiKeyId: keyId }, select: { codes: true } });
    if (!row) return NextResponse.json({ error: "Isu tidak ditemukan di proyek ini" }, { status: 404 });
    codes = row.codes;
  }
  if (label) {
    const rows = await prisma.itemLabel.findMany({ where: { apiKeyId: keyId, type: "social", label }, select: { code: true } });
    const labelled = new Set(rows.map((r) => r.code));
    codes = codes ? codes.filter((c) => labelled.has(c)) : [...labelled];
  }
  return { codes: codes ?? [], key: `issue:${issue ?? ""}|label:${label ?? ""}` };
}
