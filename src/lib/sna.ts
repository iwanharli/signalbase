// Shared by the SNA page and its API: periods, emotion → line colour, and the hub/child graph built from mention rows.

export const SNA_PERIODS = [{ days: 1, label: "1 hari" }, { days: 3, label: "3 hari" }, { days: 7, label: "7 hari" }] as const;
export type SnaDays = (typeof SNA_PERIODS)[number]["days"];
export const DEFAULT_SNA_DAYS: SnaDays = 1;
export const SNA_LIMITS = [25, 50, 100, 200] as const;
export type SnaLimit = (typeof SNA_LIMITS)[number];
export const DEFAULT_SNA_LIMIT: SnaLimit = 25;
/** Mentioned accounts kept per main account: the fewer the hubs the more each keeps, so the whole graph stays around 400 children. */
export const childrenPerHub = (limit: number) => Math.max(3, Math.floor(400 / limit));

/** The maximum number of main accounts from ?limit=; null when it is not one of the allowed choices. */
export function parseSnaLimit(raw: string | null): SnaLimit | null {
  if (raw === null) return DEFAULT_SNA_LIMIT;
  return SNA_LIMITS.find((n) => String(n) === raw) ?? null;
}

/** The period from ?days=; null when it is not one of the allowed choices. */
export function parseSnaDays(raw: string | null): SnaDays | null {
  if (raw === null) return DEFAULT_SNA_DAYS;
  return SNA_PERIODS.find((p) => String(p.days) === raw)?.days ?? null;
}

export type Tone = "negative" | "neutral" | "positive" | "unknown";
const TONE_BY_EMOTION: Record<string, Tone> = {
  marah: "negative", menolak: "negative", kecewa: "negative", sarkasme: "negative",
  netral: "neutral",
  mendukung: "positive", puas: "positive", dukungan: "positive",
};
export const toneOf = (emotion: string | null): Tone => TONE_BY_EMOTION[(emotion ?? "").toLowerCase()] ?? "unknown";
export const TONE_COLOR: Record<Tone, string> = { negative: "#fb7185", neutral: "#60a5fa", positive: "#4ade80", unknown: "#94a3b8" };
export const TONE_LABEL: Record<Tone, string> = { negative: "Marah / menolak", neutral: "Netral", positive: "Mendukung / puas", unknown: "Tanpa emosi" };
const TONE_ORDER: Tone[] = ["negative", "positive", "neutral", "unknown"];

export type SnaHub = { username: string; source: string; posts: number };
/** One row of the mention query: `n` mentions of `target` by `hub` in posts with this emotion. */
export type SnaRow = { hub: string; target: string; emotion: string | null; n: number };

export type SnaNode = { id: string; kind: "hub" | "child"; posts: number; mentions: number; source?: string };
export type SnaLink = { source: string; target: string; n: number; tone: Tone; counts: Record<Tone, number> };
export type SnaGraph = { nodes: SnaNode[]; links: SnaLink[] };

const emptyCounts = (): Record<Tone, number> => ({ negative: 0, neutral: 0, positive: 0, unknown: 0 });

/** The tone with the most mentions; a known tone always beats "unknown", and ties go negative → positive → neutral. */
export function dominantTone(counts: Record<Tone, number>): Tone {
  const known = TONE_ORDER.filter((t) => t !== "unknown" && counts[t] > 0);
  const pool = known.length ? known : (["unknown"] as Tone[]);
  return pool.reduce((best, t) => (counts[t] > counts[best] ? t : best), pool[0]);
}

/** Hubs with their most-mentioned accounts (at most `perHub` each) as nodes and coloured links. A mentioned account that is itself a hub stays one node. */
export function buildGraph(hubs: SnaHub[], rows: SnaRow[], perHub = childrenPerHub(DEFAULT_SNA_LIMIT)): SnaGraph {
  const hubIds = new Set(hubs.map((h) => h.username));
  const pairs = new Map<string, SnaLink>();
  for (const r of rows) {
    if (!hubIds.has(r.hub) || r.hub === r.target) continue;
    const key = `${r.hub}\u0000${r.target}`;
    const link = pairs.get(key) ?? { source: r.hub, target: r.target, n: 0, tone: "unknown" as Tone, counts: emptyCounts() };
    link.n += r.n;
    link.counts[toneOf(r.emotion)] += r.n;
    pairs.set(key, link);
  }
  const links: SnaLink[] = [];
  for (const hub of hubs) {
    const own = [...pairs.values()].filter((l) => l.source === hub.username).sort((a, b) => b.n - a.n || a.target.localeCompare(b.target)).slice(0, perHub);
    for (const l of own) links.push({ ...l, tone: dominantTone(l.counts) });
  }
  const mentions = new Map<string, number>();
  for (const l of links) { mentions.set(l.source, (mentions.get(l.source) ?? 0) + l.n); mentions.set(l.target, (mentions.get(l.target) ?? 0) + l.n); }
  const nodes: SnaNode[] = hubs.map((h) => ({ id: h.username, kind: "hub", posts: h.posts, mentions: mentions.get(h.username) ?? 0, source: h.source }));
  for (const id of new Set(links.map((l) => l.target))) if (!hubIds.has(id)) nodes.push({ id, kind: "child", posts: 0, mentions: mentions.get(id) ?? 0 });
  return { nodes, links };
}

export const emptyHubs = (): SnaGraph => ({ nodes: [], links: [] });

export const SNA_POSTS = 20;
export type SnaRole = "hub" | "child";
export const isSnaRole = (v: string | null): v is SnaRole => v === "hub" || v === "child";
/** A post shown in the account panel: the account's own post (hub) or one that mentions it (child). */
export type SnaPost = { code: string; source: string; username: string | null; content: string; url: string | null; ts: string; emotion: string | null };
/** Latest posts plus how many there were per bucket (hour for 1 day, otherwise day). */
export type SnaAccount = { posts: SnaPost[]; buckets: { key: string; n: number }[] };

/** Emotion counts of a node: its own posts (outgoing links) for a hub, the posts mentioning it (incoming) for a child. */
export function nodeCounts(links: SnaLink[], id: string, role: SnaRole): Record<Tone, number> {
  const c = emptyCounts();
  for (const l of links) if ((role === "hub" ? l.source : l.target) === id) for (const t of TONE_ORDER) c[t] += l.counts[t];
  return c;
}
