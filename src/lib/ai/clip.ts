// Text from AI replies, made safe to store. Postgres jsonb rejects half of a surrogate pair (half an emoji), which a plain
// .slice can leave behind; one such character made a whole archived report fail to save (26 Nov 2026).

const HIGH = /[\uD800-\uDBFF]$/;
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** At most `max` UTF-16 units without cutting an emoji or other surrogate pair in half. */
export const clip = (s: string, max: number) => {
  const out = s.slice(0, max);
  return HIGH.test(out) ? out.slice(0, -1) : out;
};

/** Every string inside a JSON-like value with stray surrogate halves replaced, so jsonb accepts it. */
export function wellFormed<T>(value: T): T {
  if (typeof value === "string") return value.replace(LONE, "�") as T;
  if (Array.isArray(value)) return value.map(wellFormed) as T;
  // Plain objects only: a Date (or anything else with its own toJSON) is left for JSON serialisation as it is.
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wellFormed(v)])) as T;
  return value;
}

/** Where a reply broke the schema, short enough for a log line: "temuan.2.isi: String must contain at least 1 character(s)". */
export const schemaIssues = (issues: readonly { path: readonly PropertyKey[]; message: string }[], max = 3) =>
  issues.slice(0, max).map((i) => `${i.path.map(String).join(".") || "(akar)"}: ${i.message}`).join("; ");
