// Shared by the Ontologi page and its API: early-warning alerts (an issue) and the actors / targets they name.

export const ONT_PERIODS = [{ days: 1, label: "1 hari" }, { days: 3, label: "3 hari" }, { days: 7, label: "7 hari" }, { days: 14, label: "14 hari" }, { days: 30, label: "1 bulan" }] as const;
export type OntDays = (typeof ONT_PERIODS)[number]["days"];
export const DEFAULT_ONT_DAYS: OntDays = 7; // alerts are rare (tens a week), so a week is the useful default

/** The period from ?days=; null when it is not one of the allowed choices. */
export function parseOntDays(raw: string | null): OntDays | null {
  if (raw === null) return DEFAULT_ONT_DAYS;
  return ONT_PERIODS.find((p) => String(p.days) === raw)?.days ?? null;
}

export const LEVEL_COLOR: Record<string, string> = { Critical: "#fb7185", High: "#fdba74" };
export const levelColor = (level: string) => LEVEL_COLOR[level] ?? "#fde68a";
export const TOGGLE_LEVELS = ["Critical", "High"] as const;

export type OntPost = { url: string | null; author: string; source: string; content: string; emotion: string | null };
export type OntIssue = {
  id: string; title: string; level: string; score: number; postCount: number; sentAt: string;
  actors: string[]; targets: string[];
  summary: string | null; reaction: string | null; risk: string | null; location: string | null; category: string | null;
  emotion: string | null; signals: string[]; contentType: string | null; window: string | null; posts: OntPost[];
};

export type OntNode = { id: string; kind: "issue" | "actor" | "target"; label: string; level?: string; score: number; count: number; asActor: number; asTarget: number };
/** actor → issue ("actor" link) and issue → target ("target" link). */
export type OntLink = { source: string; target: string; role: "actor" | "target" };
export type OntGraph = { nodes: OntNode[]; links: OntLink[] };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const entityId = (name: string) => `e:${clean(name).toLowerCase()}`;
export const issueNodeId = (id: string) => `i:${id}`;

/** Issues whose actors or targets contain one of the keywords (case-insensitive); no keywords = every issue. */
export function matchesKeywords(issue: OntIssue, keywords: string[]) {
  if (!keywords.length) return true;
  const names = [...issue.actors, ...issue.targets].map((n) => n.toLowerCase());
  return keywords.some((k) => names.some((n) => n.includes(k.toLowerCase())));
}

/** Issues with these levels switched off are dropped (so the entities only they named drop out of the graph too). */
export const filterLevels = (issues: OntIssue[], off: readonly string[]) => (off.length ? issues.filter((i) => !off.includes(i.level)) : issues);

/** One node per issue and per named entity (names that differ only in case or spacing are the same entity). */
export function buildOntologi(issues: OntIssue[]): OntGraph {
  const nodes: OntNode[] = [], links: OntLink[] = [];
  const entities = new Map<string, OntNode>();
  const entity = (name: string, role: "actor" | "target") => {
    const id = entityId(name);
    const node = entities.get(id) ?? { id, kind: role, label: clean(name), score: 0, count: 0, asActor: 0, asTarget: 0 };
    entities.set(id, node);
    return node;
  };
  for (const issue of issues) {
    const iid = issueNodeId(issue.id);
    nodes.push({ id: iid, kind: "issue", label: issue.title, level: issue.level, score: issue.score, count: issue.postCount, asActor: 0, asTarget: 0 });
    const seen = new Set<string>();
    for (const [names, role] of [[issue.actors, "actor"], [issue.targets, "target"]] as const) {
      for (const name of names) {
        if (!clean(name)) continue;
        const e = entity(name, role), key = `${role}|${e.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        e.count += 1;
        if (role === "actor") e.asActor += 1; else e.asTarget += 1;
        links.push(role === "actor" ? { source: e.id, target: iid, role } : { source: iid, target: e.id, role });
      }
    }
  }
  for (const e of entities.values()) { e.kind = e.asActor >= e.asTarget ? "actor" : "target"; nodes.push(e); }
  return { nodes, links };
}

/** "2026-10-12T12:00:00+07:00 - 2026-10-13T18:00:00+07:00" as "12 Okt 2026, 12.00 – 13 Okt 2026, 18.00 WIB"; the raw text when it cannot be read. */
export function formatWindow(raw: string | null): string | null {
  if (!raw) return null;
  const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });
  const parts = raw.split(/\s+-\s+/).map((p) => new Date(p.trim()));
  if (parts.length !== 2 || parts.some((d) => Number.isNaN(d.getTime()))) return raw;
  return `${parts.map((d) => fmt.format(d)).join(" – ")} WIB`;
}
