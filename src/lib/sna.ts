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

export type SnaHub = { username: string; source: string; posts: number; engagement?: number };
/** One row of the mention query: `n` mentions of `target` by `hub` in posts with this emotion. */
export type SnaRow = { hub: string; target: string; emotion: string | null; n: number; eng?: number };

/** hub: main account; child: mentioned account; issue: an issue of the project (issue view), linked from the accounts posting in it.
 *  `engagement`: likes + 2 x comments + 3 x shares of the account's posts in view (node size); `title`: an issue's title. */
export type SnaNode = {
  id: string; kind: "hub" | "child" | "issue"; posts: number; mentions: number; source?: string; engagement?: number; title?: string;
  /** What runs the account (lib/ai/accountKind.ts): a news outlet, an institution, or the public. Set by the server. */
  account?: "media" | "institusi" | "publik";
  /** Issue view: the account's first post in the issue (Jakarta wall-clock, YYYY-MM-DDTHH:MM:SS); `wave` its wave (flow "gelombang"). */
  first?: string; wave?: number;
};
export const ACCOUNT_LABEL = { media: "Media berita", institusi: "Institusi", publik: "Akun publik" } as const;
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
  const reach = new Map<string, number>(); // engagement of the posts mentioning each account, per hub -> target pair
  for (const r of rows) {
    if (!hubIds.has(r.hub) || r.hub === r.target) continue;
    const key = `${r.hub}\u0000${r.target}`;
    const link = pairs.get(key) ?? { source: r.hub, target: r.target, n: 0, tone: "unknown" as Tone, counts: emptyCounts() };
    link.n += r.n;
    link.counts[toneOf(r.emotion)] += r.n;
    pairs.set(key, link);
    reach.set(key, (reach.get(key) ?? 0) + (r.eng ?? 0));
  }
  const links: SnaLink[] = [];
  for (const hub of hubs) {
    const own = [...pairs.values()].filter((l) => l.source === hub.username).sort((a, b) => b.n - a.n || a.target.localeCompare(b.target)).slice(0, perHub);
    for (const l of own) links.push({ ...l, tone: dominantTone(l.counts) });
  }
  const mentions = new Map<string, number>();
  for (const l of links) { mentions.set(l.source, (mentions.get(l.source) ?? 0) + l.n); mentions.set(l.target, (mentions.get(l.target) ?? 0) + l.n); }
  const childEng = new Map<string, number>();
  for (const l of links) childEng.set(l.target, (childEng.get(l.target) ?? 0) + (reach.get(`${l.source}\u0000${l.target}`) ?? 0));
  const nodes: SnaNode[] = hubs.map((h) => ({ id: h.username, kind: "hub", posts: h.posts, mentions: mentions.get(h.username) ?? 0, source: h.source, engagement: h.engagement }));
  for (const id of new Set(links.map((l) => l.target))) if (!hubIds.has(id)) nodes.push({ id, kind: "child", posts: 0, mentions: mentions.get(id) ?? 0, engagement: childEng.get(id) });
  return { nodes, links };
}

export const emptyHubs = (): SnaGraph => ({ nodes: [], links: [] });

export const SNA_POSTS = 20;
/** hub: the account's posts that mention someone; child: posts mentioning the account; author: all its posts (issue view). */
export type SnaRole = "hub" | "child" | "author";
export const isSnaRole = (v: string | null): v is SnaRole => v === "hub" || v === "child" || v === "author";

/** The two SNA views of a project: accounts around its issues, or who mentions whom. */
export type SnaView = "isu" | "mention";
/** Issue view: the 10 highest-scoring issues; the limit choice (25/50/100/200) means accounts per issue, the most engaging. */
export const ISSUES_SHOWN = 10;
const PER_ISSUE: Record<number, number> = { 25: 10, 50: 25, 100: 50, 200: 100 };
export const accountsPerIssue = (limit: number) => PER_ISSUE[limit] ?? 10;

/** `first`: the account's first post in the issue with this emotion (Jakarta wall-clock, YYYY-MM-DDTHH:MM:SS). */
export type IssueAccountRow = { issue: string; username: string; source: string; emotion: string | null; n: number; eng: number; first?: string };
/** In an issue's posts, `source` mentions or replies to `target`. */
export type MentionPair = { issue: string; source: string; target: string };

/** How the accounts of an issue hang together in the issue view (see buildIssueGraph). */
export const SNA_FLOWS = [
  { value: "langsung", label: "Langsung" }, { value: "mention", label: "Mention" },
  { value: "rantai", label: "Rantai waktu" }, { value: "gelombang", label: "Gelombang" },
] as const;
export type SnaFlow = (typeof SNA_FLOWS)[number]["value"];
export const parseSnaFlow = (raw: string | null): SnaFlow => SNA_FLOWS.find((f) => f.value === raw)?.value ?? "langsung";
/** Wave limits in hours since the issue's first post: ≤ 1 h, ≤ 6 h, ≤ 24 h, ≤ 3 days, later. */
export const WAVE_HOURS = [1, 6, 24, 72] as const;
export const WAVE_LABEL = ["", "Gelombang 1 · jam pertama", "Gelombang 2 · 1–6 jam", "Gelombang 3 · 6–24 jam", "Gelombang 4 · 1–3 hari", "Gelombang 5 · > 3 hari"];

/**
 * Issue view: each issue is a node with the accounts posting in it. `flow` says how they hang together:
 * - langsung: every account links to the issue (its `perIssue` most engaging);
 * - mention: an account hangs under the earlier account it mentions or replies to in the issue, else under the issue;
 * - rantai: in order of their first post: the first links to the issue, each next one to the one before;
 * - gelombang: by waves of time since the issue's first post; the first wave links to the issue, each later account to the
 *   most engaging account of the wave before.
 * In the three flows, who links to the issue is decided by time: the earliest posters (the first third of the accounts kept
 * are the earliest ones, the rest the most engaging). An account in several issues is one node. Sized by engagement.
 */
export function buildIssueGraph(issues: { id: string; title: string; posts: number }[], rows: IssueAccountRow[], perIssue: number, flow: SnaFlow = "langsung", mentions: MentionPair[] = []): SnaGraph {
  type Acc = { username: string; source: string; n: number; eng: number; first: string; counts: Record<Tone, number> };
  const byIssue = new Map<string, Map<string, Acc>>();
  for (const r of rows) {
    const m = byIssue.get(r.issue) ?? new Map<string, Acc>();
    const a = m.get(r.username) ?? { username: r.username, source: r.source, n: 0, eng: 0, first: r.first ?? "", counts: emptyCounts() };
    a.n += r.n; a.eng += r.eng; a.counts[toneOf(r.emotion)] += r.n;
    if (r.first && (!a.first || r.first < a.first)) a.first = r.first;
    m.set(r.username, a);
    byIssue.set(r.issue, m);
  }
  const byFirst = (a: Acc, b: Acc) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.username.localeCompare(b.username));
  const mentioned = new Map<string, Set<string>>(); // issue + poster (lower case) -> mentioned accounts (lower case)
  for (const p of mentions) {
    const key = `${p.issue}\u0000${norm(p.source)}`;
    mentioned.set(key, (mentioned.get(key) ?? new Set()).add(norm(p.target)));
  }

  const links = new Map<string, SnaLink>();
  const shown = new Map<string, { source: string; posts: number; eng: number; first: string; wave?: number }>();
  const link = (from: Acc, to: string) => {
    const key = `${from.username}\u0000${to}`;
    const l = links.get(key) ?? { source: from.username, target: to, n: 0, tone: "unknown" as Tone, counts: emptyCounts() };
    l.n += from.n;
    for (const t of TONE_ORDER) l.counts[t] += from.counts[t];
    links.set(key, l);
  };
  for (const [issue, m] of byIssue) {
    const all = [...m.values()];
    const byEng = [...all].sort((a, b) => b.eng - a.eng || a.username.localeCompare(b.username));
    let kept: Acc[];
    if (flow === "langsung") kept = byEng.slice(0, perIssue);
    else {
      const early = [...all].sort(byFirst).slice(0, Math.ceil(perIssue / 3));
      const pick = new Set(early);
      for (const a of byEng) { if (pick.size >= perIssue) break; pick.add(a); }
      kept = [...pick];
    }
    kept.sort(byFirst);
    const issueNode = `issue:${issue}`;
    const start = kept[0]?.first ? Date.parse(`${kept[0].first}+07:00`) : NaN;
    const waveOf = (a: Acc) => { const h = (Date.parse(`${a.first}+07:00`) - start) / 3_600_000; const i = WAVE_HOURS.findIndex((x) => h <= x); return Number.isFinite(h) ? (i < 0 ? WAVE_HOURS.length : i) + 1 : 1; };
    const lower = new Map(kept.map((a) => [norm(a.username), a]));
    kept.forEach((a, i) => {
      let parent = issueNode;
      if (flow === "rantai" && i > 0) parent = kept[i - 1].username;
      if (flow === "mention") {
        // The earliest account it mentions that posted in the issue before it (so the tree always runs forward in time).
        const targets = [...(mentioned.get(`${issue}\u0000${norm(a.username)}`) ?? [])].map((t) => lower.get(t)).filter((t): t is Acc => !!t && t !== a && byFirst(t, a) < 0);
        if (targets.length) parent = targets.sort(byFirst)[0].username;
      }
      if (flow === "gelombang") {
        const w = waveOf(a);
        const before = kept.filter((b) => waveOf(b) < w);
        if (before.length) {
          const last = Math.max(...before.map(waveOf));
          parent = before.filter((b) => waveOf(b) === last).sort((x, y) => y.eng - x.eng || x.username.localeCompare(y.username))[0].username;
        }
      }
      link(a, parent);
      const node = shown.get(a.username) ?? { source: a.source, posts: 0, eng: 0, first: a.first };
      node.posts += a.n; node.eng += a.eng;
      if (a.first && (!node.first || a.first <= node.first)) { node.first = a.first; if (flow === "gelombang") node.wave = waveOf(a); }
      shown.set(a.username, node);
    });
  }
  const out = [...links.values()].map((l) => ({ ...l, tone: dominantTone(l.counts) }));
  const linkedIssues = new Set(out.map((l) => l.target));
  const nodes: SnaNode[] = issues.filter((i) => linkedIssues.has(`issue:${i.id}`))
    .map((i) => ({ id: `issue:${i.id}`, kind: "issue", posts: i.posts, mentions: 0, title: i.title }));
  for (const [username, a] of shown) nodes.push({ id: username, kind: "hub", posts: a.posts, mentions: 0, source: a.source, engagement: a.eng, ...(a.first ? { first: a.first } : {}), ...(a.wave ? { wave: a.wave } : {}) });
  return { nodes, links: out };
}

const norm = (u: string) => u.trim().replace(/^@/, "").toLowerCase();

/** A post shown in the account panel: the account's own post (hub) or one that mentions it (child). */
export type SnaPost = { code: string; source: string; username: string | null; content: string; url: string | null; ts: string; emotion: string | null };
/** Latest posts plus how many there were per bucket (hour for 1 day, otherwise day). */
export type SnaAccount = { posts: SnaPost[]; buckets: { key: string; n: number }[] };

/** Emotion counts of a node: its own posts (outgoing links) for a hub, the posts mentioning it (incoming) for a child. */
export function nodeCounts(links: SnaLink[], id: string, role: SnaRole): Record<Tone, number> {
  const c = emptyCounts();
  for (const l of links) if ((role === "child" ? l.target : l.source) === id) for (const t of TONE_ORDER) c[t] += l.counts[t];
  return c;
}

/** The graph with some emotions switched off: links keep only the counts of the emotions still on (and vanish when none is left), accounts left without a link vanish (hubs included). */
export function filterGraph(g: SnaGraph, off: readonly Tone[]): SnaGraph {
  if (!off.length) return g;
  const links: SnaLink[] = [];
  for (const l of g.links) {
    const counts = { ...l.counts };
    for (const t of off) counts[t] = 0;
    const n = TONE_ORDER.reduce((sum, t) => sum + counts[t], 0);
    if (n > 0) links.push({ ...l, counts, n, tone: dominantTone(counts) });
  }
  const linked = new Set(links.flatMap((l) => [l.source, l.target]));
  return { nodes: g.nodes.filter((n) => linked.has(n.id)), links };
}
