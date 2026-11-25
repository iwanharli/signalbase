// A project keyword as a Postgres full-text query (to_tsquery, 'indonesian' config). A keyword is either a plain word or
// phrase ("andi amran" = the words in that order), or an expression: phrases in quotes or bare words, joined with AND / OR
// and grouped with parentheses, e.g. (polres OR polsek) AND ("urus skck" OR "waktu tunggu"). Keywords of a project are
// still OR-ed together, so an expression only adds posts. Shared by the panel (to validate) and the server (to query).

/** "polisi tidur" is a speed bump, not the police, so it never counts as "polisi". */
const phraseQuery = (text: string) => {
  const words = text.toLowerCase().match(/[a-z0-9]+/g);
  if (!words) return null;
  const phrase = words.join(" <-> ");
  return phrase === "polisi" ? "(polisi & !(polisi <-> tidur))" : `(${phrase})`;
};

type Token = { kind: "and" | "or" | "open" | "close" } | { kind: "phrase"; text: string };

/** True when the keyword uses expression syntax: quotes, parentheses, or a standalone AND / OR. */
export const isKeywordExpression = (keyword: string) => /["()]/.test(keyword) || /(^|\s)(and|or)(\s|$)/i.test(keyword);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let words: string[] = [];
  const flush = () => { if (words.length) { tokens.push({ kind: "phrase", text: words.join(" ") }); words = []; } };
  const re = /\s*(?:"([^"]*)"|(\()|(\))|([^\s"()]+))/gy;
  let m: RegExpExecArray | null;
  let at = 0;
  while ((m = re.exec(input))) {
    at = re.lastIndex;
    const [, quoted, open, close, word] = m;
    if (quoted !== undefined) { flush(); tokens.push({ kind: "phrase", text: quoted }); }
    else if (open) { flush(); tokens.push({ kind: "open" }); }
    else if (close) { flush(); tokens.push({ kind: "close" }); }
    else if (/^(and|or)$/i.test(word)) { flush(); tokens.push({ kind: word.toLowerCase() as "and" | "or" }); }
    else words.push(word); // bare words next to each other form one phrase, as in a plain keyword
  }
  if (input.slice(at).trim()) throw new Error(input.slice(at).includes('"') ? "Tanda kutip belum ditutup" : "Kata kunci tidak bisa dibaca");
  flush();
  return tokens;
}

/** expr := and (OR and)* ; and := atom (AND atom)* ; atom := phrase | ( expr ) */
function parse(tokens: Token[]): string {
  let i = 0;
  const atom = (): string => {
    const t = tokens[i++];
    if (!t) throw new Error("Ekspresi berakhir terlalu cepat");
    if (t.kind === "open") {
      const inner = or();
      if (tokens[i++]?.kind !== "close") throw new Error("Tanda kurung belum ditutup");
      return `(${inner})`;
    }
    if (t.kind === "phrase") {
      const q = phraseQuery(t.text);
      if (!q) throw new Error(`"${t.text}" tidak berisi kata`);
      return q;
    }
    throw new Error(t.kind === "close" ? "Tanda kurung tutup tanpa pasangan" : `${t.kind.toUpperCase()} harus berada di antara dua kata atau kelompok`);
  };
  const and = (): string => { const parts = [atom()]; while (tokens[i]?.kind === "and") { i++; parts.push(atom()); } return parts.join(" & "); };
  const or = (): string => { const parts = [and()]; while (tokens[i]?.kind === "or") { i++; parts.push(and()); } return parts.join(" | "); };
  const out = or();
  if (i < tokens.length) {
    const t = tokens[i];
    throw new Error(t.kind === "close" ? "Tanda kurung tutup tanpa pasangan" : "Pakai AND atau OR di antara dua kata atau kelompok");
  }
  return out;
}

/** One keyword as a tsquery, or an error message (shown when saving). */
export function keywordToQuery(keyword: string): { query: string | null } | { error: string } {
  if (!isKeywordExpression(keyword)) return { query: phraseQuery(keyword) };
  try {
    return { query: `(${parse(tokenize(keyword))})` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Kata kunci tidak bisa dibaca" };
  }
}

/** Why a keyword cannot be used, or null. */
export const keywordProblem = (keyword: string) => {
  const r = keywordToQuery(keyword);
  return "error" in r ? r.error : r.query ? null : "Kata kunci tidak berisi kata";
};
