// Turn order for the categorisation worker: keys that pay with the same provider key form one group and take turns
// (one provider account is never called twice at once); different groups run side by side, a few at a time.
import { createHash } from "node:crypto";
import { decryptSecret } from "../secrets";

type Row = { apiKeyId: string; providerKind: string; providerBaseUrl: string | null; providerKeyEnc: string };

/** Which provider account pays for this classifier. The stored key is sealed with a random IV, so it is compared opened. */
export function providerAccount(row: Row) {
  if (row.providerKind === "signalbase") return "signalbase";
  try {
    const key = decryptSecret(row.providerKeyEnc);
    return `${row.providerKind}|${row.providerBaseUrl ?? ""}|${createHash("sha256").update(key).digest("hex")}`;
  } catch {
    return `key|${row.apiKeyId}`; // unreadable key: its own group (its run reports the error)
  }
}

/** Groups in first-seen order; within each group the start shifts by `turn`, so no key always goes first. */
export function turnGroups<T>(items: T[], groupOf: (item: T) => string, turn: number): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const g = groupOf(item);
    groups.set(g, [...(groups.get(g) ?? []), item]);
  }
  return [...groups.values()].map((g) => { const s = turn % g.length; return [...g.slice(s), ...g.slice(0, s)]; });
}

/** Runs `work` for every item, at most `limit` at once. */
export async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const lane = async () => { while (next < items.length) await work(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, lane));
}
