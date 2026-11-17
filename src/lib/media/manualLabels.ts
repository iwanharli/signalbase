// Manual labels of a project: choices its owner (or an admin) sets, which people pick for each post or article.
// Separate from AI categorisation: nothing here is written or read by the classifier.

export const MAX_LABELS = 30;
/** Filter value for "every item that has a manual label". */
export const ANY_LABEL = "__any";
export const MAX_LABEL_LENGTH = 40;

/** Cleans a list of label choices: trimmed, inner spaces collapsed, empties and case-insensitive duplicates dropped
 *  (the first spelling wins), order kept. Throws when a label is too long or there are too many. */
export function normalizeLabels(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error("Daftar label tidak valid");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") throw new Error("Daftar label tidak valid");
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label) continue;
    if (label.length > MAX_LABEL_LENGTH) throw new Error(`Label maksimal ${MAX_LABEL_LENGTH} karakter: "${label.slice(0, 20)}…"`);
    const key = label.toLocaleLowerCase("id");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  if (out.length > MAX_LABELS) throw new Error(`Maksimal ${MAX_LABELS} label per proyek`);
  return out;
}

/** Mantine colour of a label: fixed by its position in the project's list, the same on cards, filters and settings. */
const LABEL_COLORS = ["violet", "red", "teal", "orange", "blue", "pink", "lime", "indigo", "yellow", "grape", "cyan", "green"];
export const labelColor = (options: string[], label: string) => LABEL_COLORS[Math.max(0, options.indexOf(label)) % LABEL_COLORS.length];

/** What the panel needs to show labels for one project. */
export type LabelSettings = {
  options: string[];
  /** May change the choices: the project's owner and admins. */
  canEdit: boolean;
  /** May label posts: owner, admins and sub-accounts it is shared with (not viewers). */
  canLabel: boolean;
  /** Posts and articles carrying each label in this project. */
  counts: Record<string, number>;
};

/** A choice renamed in the settings: posts labelled `from` move to `to`. */
export type LabelRename = { from: string; to: string };
