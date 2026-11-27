// Issues from clustering a project's social posts (see scripts/clustering/cluster_service.py and server/issueClusters/worker.ts):
// the numbers per cluster, its early-warning score, and which stored cluster a new one carries on.

export type ClusterPost = { code: string; author: string | null; mood: string | null; ts: string };
export type ClusterStats = {
  posts: number; authors: number; negShare: number; growth: number;
  perDay: Record<string, number>; moods: [string, number][]; firstSeen: string; lastSeen: string;
};

/** Emotions that count as negative reaction. */
const NEGATIVE = new Set(["menolak", "marah"]);
/** A cluster needs this many different accounts: fewer is one account repeating itself (promotion, spam). */
export const MIN_AUTHORS = 5;

/** Numbers of one cluster over `days` (YYYY-MM-DD, oldest first; timestamps are Jakarta wall-clock strings). */
export function clusterStats(posts: ClusterPost[], days: string[]): ClusterStats {
  const perDay = Object.fromEntries(days.map((d) => [d, 0])) as Record<string, number>;
  const moods = new Map<string, number>();
  for (const p of posts) {
    const day = p.ts.slice(0, 10);
    if (day in perDay) perDay[day]++;
    if (p.mood) moods.set(p.mood, (moods.get(p.mood) ?? 0) + 1);
  }
  const labelled = [...moods.values()].reduce((s, n) => s + n, 0);
  const neg = [...moods].reduce((s, [m, n]) => s + (NEGATIVE.has(m) ? n : 0), 0);
  // Last 2 days per day over the days before per day; a brand-new issue (nothing before) counts as strong growth.
  const recent = days.slice(-2).reduce((s, d) => s + perDay[d], 0) / Math.max(1, Math.min(2, days.length));
  const before = days.slice(0, -2);
  const earlier = before.reduce((s, d) => s + perDay[d], 0) / Math.max(1, before.length);
  const sorted = posts.map((p) => p.ts).sort();
  return {
    posts: posts.length,
    authors: new Set(posts.map((p) => p.author ?? "")).size,
    negShare: labelled ? neg / labelled : 0,
    growth: recent / Math.max(earlier, 0.5),
    perDay,
    moods: [...moods].sort((a, b) => b[1] - a[1]).slice(0, 5),
    firstSeen: sorted[0] ?? "",
    lastSeen: sorted.at(-1) ?? "",
  };
}

/** Early-warning score 0-100: size (log), negative share, growth of the last 2 days, and spread over accounts. For ordering. */
export function issueScore(s: Pick<ClusterStats, "posts" | "authors" | "negShare" | "growth">) {
  const spread = Math.min(1, (s.authors / Math.max(1, s.posts)) * 2);
  const raw = 18 * Math.log1p(s.posts) * (0.5 + s.negShare) * Math.sqrt(Math.min(s.growth, 3)) * spread;
  return Math.round(Math.min(100, raw) * 10) / 10;
}

/**
 * Which stored cluster each new one carries on: the stored one sharing the most posts, if they share at least half of
 * the smaller one. Each stored cluster is taken once (largest new clusters first). Returns new index -> stored id.
 */
export function matchClusters(next: string[][], stored: { id: string; codes: string[] }[]): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set<string>();
  const sets = stored.map((s) => ({ id: s.id, codes: new Set(s.codes) }));
  const order = next.map((codes, i) => [i, codes] as const).sort((a, b) => b[1].length - a[1].length);
  for (const [i, codes] of order) {
    let best: { id: string; share: number } | null = null;
    for (const s of sets) {
      if (taken.has(s.id) || !s.codes.size) continue;
      const shared = codes.reduce((n, c) => n + (s.codes.has(c) ? 1 : 0), 0);
      const share = shared / Math.max(1, Math.min(codes.length, s.codes.size));
      if (share >= 0.5 && (!best || share > best.share)) best = { id: s.id, share };
    }
    if (best) { out.set(i, best.id); taken.add(best.id); }
  }
  return out;
}

/** The AI title is (re)written for a cluster that has none yet, or that has doubled since it was titled. */
export const needsTitle = (c: { title: string | null; titledAt: number; posts: number }) => !c.title || c.posts >= c.titledAt * 2;
