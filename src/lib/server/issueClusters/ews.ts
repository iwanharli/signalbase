// A project's own issues (IssueCluster, clustered from its posts every hour) in the shape of the EWS / Ontologi pages, so
// those pages no longer depend on the bank's `alerts` table, which rarely names a project's keywords. Whole-bank views
// (no project) keep the bank's alerts.
import { moodInfo } from "@/lib/media/mood";
import type { OntDays, OntIssue, OntPost } from "@/lib/ontology";
import { prisma } from "../db";

/** Score (0-100, server/issueClusters) to the EWS levels the pages know. */
export const levelOf = (score: number) => (score >= 55 ? "Critical" : "High");

const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }); // stored as wall clock
const host = (url: string | null) => { try { return url ? new URL(url).hostname.replace(/^www\./, "").split(".")[0] : ""; } catch { return ""; } };

type Sample = { code: string; text: string; author: string | null; url: string | null; ts: string };

/** The project's active issues seen in the last `days` days (they cover at most the last 7), highest score first. */
export async function projectIssues(keyId: string, days: OntDays): Promise<OntIssue[]> {
  const since = new Date(Date.now() - days * 86_400_000 + 7 * 3_600_000); // lastSeen is Jakarta wall clock stored as UTC
  const rows = await prisma.issueCluster.findMany({ where: { apiKeyId: keyId, active: true, lastSeen: { gte: since } }, orderBy: { score: "desc" } });
  return rows.map((r): OntIssue => {
    const moods = (r.moods as [string, number][]) ?? [];
    const labelled = moods.reduce((s, [, n]) => s + n, 0);
    const posts = ((r.samples as Sample[]) ?? []).slice(0, 3).map((s): OntPost => ({ url: s.url, author: s.author ?? "", source: host(s.url), content: s.text.slice(0, 280), emotion: null }));
    const growth = r.growth >= 1.5 ? `naik ×${r.growth.toFixed(1)} dalam 2 hari terakhir` : r.growth <= 0.5 ? "mereda" : "stabil";
    return {
      id: r.id, title: r.title ?? r.keywords.slice(0, 4).join(", "), level: levelOf(r.score), score: Math.round(r.score), postCount: r.posts,
      sentAt: r.updatedAt.toISOString(), actors: r.actors, targets: r.targets, summary: r.summary,
      reaction: labelled ? moods.map(([m, n]) => `${moodInfo(m).label} ${pct(n / labelled)}`).join(", ") : null,
      risk: `Porsi negatif ${pct(r.negShare)} · ${growth} · ${r.authors} akun`,
      location: null, category: null, emotion: moods[0]?.[0] ?? null, signals: r.keywords.slice(0, 6),
      contentType: "Klaster post media sosial proyek", window: `${day(r.firstSeen)} – ${day(r.lastSeen)}`, posts,
    };
  });
}
