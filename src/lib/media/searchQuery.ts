// The media search box, read into parts. Parts are alternatives (OR or "|"); within one part everything must match:
//   words            all of them, any order, Indonesian stems ("tolak" finds "menolak")
//   "a phrase"       those words next to each other, in that order
//   @handle          posts by that account: the handle (exact, any case) or a name containing it
//   @"display name"  the same for a name with spaces
// Quotes protect OR and "|" inside them. Unclosed quotes are treated as closed at the end.

export type SearchPart = { words: string; phrases: string[]; accounts: string[] };

const MAX_PARTS = 8;

/** Splits on OR / "|" outside quotes. */
function splitParts(q: string): string[] {
  const parts: string[] = [];
  let current = "", quoted = false;
  for (let i = 0; i < q.length; i++) {
    const ch = q[i];
    if (ch === '"') { quoted = !quoted; current += ch; continue; }
    if (!quoted && ch === "|") { parts.push(current); current = ""; continue; }
    // The word OR, standing alone (surrounded by spaces or the ends).
    if (!quoted && /\s/.test(q[i - 1] ?? " ") && /^or(?=\s|$)/i.test(q.slice(i, i + 3))) { parts.push(current); current = ""; i += 1; continue; }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function readPart(text: string): SearchPart {
  const phrases: string[] = [], accounts: string[] = [];
  const rest = text
    .replace(/@"([^"]*)"?/g, (_, name: string) => { if (name.trim()) accounts.push(name.trim()); return " "; })
    .replace(/@([^\s"]+)/g, (_, handle: string) => { accounts.push(handle); return " "; })
    .replace(/"([^"]*)"?/g, (_, phrase: string) => { if (phrase.trim()) phrases.push(phrase.trim()); return " "; });
  return { words: rest.replace(/\s+/g, " ").trim(), phrases, accounts: accounts.map((a) => a.slice(0, 60)) };
}

export function parseSearch(q: string): SearchPart[] {
  return splitParts(q.slice(0, 200)).map(readPart).filter((p) => p.words || p.phrases.length || p.accounts.length).slice(0, MAX_PARTS);
}

/** Text to look for in image text: the parts that name no account (an account is not something an image says). */
export const imageSearchText = (parts: SearchPart[]) =>
  parts.filter((p) => !p.accounts.length).map((p) => [p.words, ...p.phrases].filter(Boolean).join(" ")).filter(Boolean);

/** A value for ILIKE that matches itself literally. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
