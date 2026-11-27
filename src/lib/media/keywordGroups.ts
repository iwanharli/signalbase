// Keyword groups of a project ("Pangkat", "Jabatan", "Integritas & keuangan", …): a label per keyword to read and count
// the list by theme. Kept apart from the scope (Project.keywordGroups), so regrouping never touches the data or the AI.

/** keyword → group name. Keywords without an entry are "Tanpa kelompok". */
export type KeywordGroups = Record<string, string>;
export const UNGROUPED = "Tanpa kelompok";
export const MAX_GROUP_NAME = 60;

const clean = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_GROUP_NAME);

/** The stored value read safely: only the project's keywords, non-empty names. */
export function parseKeywordGroups(raw: unknown, keywords: string[]): KeywordGroups {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const known = new Set(keywords);
  const out: KeywordGroups = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (known.has(k) && typeof v === "string" && clean(v)) out[k] = clean(v);
  }
  return out;
}

/** Groups in the order their first keyword appears in the list; keywords without a group last. */
export function groupKeywords(keywords: string[], groups: KeywordGroups): { name: string; keywords: string[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, string[]>();
  for (const k of keywords) {
    const name = groups[k] ?? UNGROUPED;
    if (!byGroup.has(name)) { byGroup.set(name, []); if (name !== UNGROUPED) order.push(name); }
    byGroup.get(name)!.push(k);
  }
  if (byGroup.has(UNGROUPED)) order.push(UNGROUPED);
  return order.map((name) => ({ name, keywords: byGroup.get(name)! }));
}

/** The group names in use, in list order (for the group picker). */
export const groupNames = (keywords: string[], groups: KeywordGroups) => groupKeywords(keywords, groups).map((g) => g.name).filter((n) => n !== UNGROUPED);
