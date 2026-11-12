import { allowsType, OPEN_SCOPE, type KeyScope } from "@/lib/media/keyScope";
import { decodeTextEntities } from "@/lib/media/text";
import { matchesKeywords, type OntDays, type OntIssue, type OntPost } from "@/lib/ontologi";
import { sharedCache } from "./cache";
import { analyticsPool } from "./pool";

const cache = sharedCache<OntIssue[]>("ontologi", { ttlMs: 60_000, maxEntries: 50, staleWhileRevalidate: true });
type Row = { id: string; cluster_id: string; level_ews: string; skor_ews: number; post_count: number; sent_at: Date; alert_data: Record<string, unknown> | null };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? decodeTextEntities(v) : null);
const safeUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

function toIssue(r: Row): OntIssue {
  const d = r.alert_data ?? {}, meta = (d.metadata && typeof d.metadata === "object" ? d.metadata : {}) as Record<string, unknown>;
  const posts = (Array.isArray(d.representative_posts) ? d.representative_posts : []).slice(0, 3).map((p: Record<string, unknown>): OntPost => ({
    url: safeUrl(p.url), author: String(p.author ?? ""), source: String(p.source ?? ""), content: decodeTextEntities(String(p.content ?? "")).slice(0, 280), emotion: typeof p.emotion === "string" ? p.emotion.toLowerCase() : null,
  }));
  return {
    id: String(r.cluster_id), title: text(d.alert_title) ?? `Isu ${r.cluster_id}`, level: r.level_ews, score: r.skor_ews, postCount: r.post_count, sentAt: new Date(r.sent_at).toISOString(),
    actors: strings(d.actor), targets: strings(d.target),
    summary: text(d.event_summary), reaction: text(d.public_reaction), risk: text(d.risk_assessment), location: text(d.location), category: text(meta.category),
    emotion: typeof meta.emosi_dominan === "string" ? meta.emosi_dominan.toLowerCase() : null, signals: strings(meta.top_signals),
    contentType: text(d.content_type), window: text(d.time_window), posts,
  };
}

/** Early-warning alerts of the last `days` days, newest alert per cluster, highest score first. A key's keywords keep only the issues naming one of them as actor or target. */
export function ontologiIssues(days: OntDays, scope?: KeyScope) {
  const s = scope ?? OPEN_SCOPE;
  return cache(`${days}|${s.keywords.join("\u0001")}`, async () => {
    if (!allowsType(s, "social")) return [];
    const { rows } = await analyticsPool().query<Row>(
      `SELECT DISTINCT ON (a.cluster_id) a.id::text id, a.cluster_id::text cluster_id, a.level_ews, a.skor_ews, a.post_count, a.sent_at, a.alert_data
       FROM alerts a WHERE a.sent_at >= CURRENT_DATE - ($1::int * INTERVAL '1 day') ORDER BY a.cluster_id, a.created_at DESC`, [days]);
    return rows.map(toIssue).filter((i) => matchesKeywords(i, s.keywords)).sort((a, b) => b.score - a.score);
  });
}
