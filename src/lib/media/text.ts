import { safeSourceUrl } from "./sourceUrl";

// Decode common scraper-escaped text once. The result must still be rendered as React text.
const ENTITIES: Record<string, string> = {
  amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">", quot: '"', QUOT: '"', apos: "'", nbsp: "\u00a0",
  hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", copy: "©", reg: "®", trade: "™",
};

export function decodeTextEntities(value: string): string;
export function decodeTextEntities(value: null | undefined): null;
export function decodeTextEntities(value: string | null | undefined): string | null;
export function decodeTextEntities(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entity: string) => {
    if (!entity.startsWith("#")) return ENTITIES[entity] ?? original;
    const hex = entity[1]?.toLowerCase() === "x";
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return original;
    return String.fromCodePoint(code);
  });
}

export type PostTextPart = { text: string; mention: boolean; href?: string };

/** Keep prose punctuation outside links, but preserve balanced URL parentheses. */
function trimLinkPunctuation(value: string): string {
  let result = value;
  while (result) {
    const trimmed = result.replace(/[.,!?;:'"…]+$/u, "");
    if (trimmed !== result) { result = trimmed; continue; }
    const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    const last = result.at(-1)!;
    const opening = pairs[last];
    if (opening && result.split(last).length > result.split(opening).length) { result = result.slice(0, -1); continue; }
    break;
  }
  return result;
}

/** URLs and emails are recognized before mentions so @ inside them stays untouched. */
export function splitPostText(value: string): PostTextPart[] {
  const tokens = /(?<![\p{L}\p{N}_])(?:https?:\/\/|www\.)[^\s<>"“”‘’]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?<![\p{L}\p{N}_@/])@[\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*/giu;
  const parts: PostTextPart[] = [];
  let end = 0;
  for (const match of value.matchAll(tokens)) {
    const start = match.index!;
    if (start > end) parts.push({ text: value.slice(end, start), mention: false });
    const token = match[0];
    if (/^(https?:\/\/|www\.)/i.test(token)) {
      const label = trimLinkPunctuation(token);
      const href = safeSourceUrl(/^www\./i.test(label) ? `https://${label}` : label);
      if (href) {
        parts.push({ text: label, mention: false, href });
        if (label.length < token.length) parts.push({ text: token.slice(label.length), mention: false });
      } else parts.push({ text: token, mention: false });
    } else parts.push({ text: token, mention: token.startsWith("@") });
    end = start + token.length;
  }
  if (end < value.length) parts.push({ text: value.slice(end), mention: false });
  return parts;
}

export function splitMentionText(value: string): { text: string; mention: boolean }[] {
  return splitPostText(value).map(({ text, mention }) => ({ text, mention }));
}
