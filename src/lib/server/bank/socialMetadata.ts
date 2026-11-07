import { safeSourceUrl } from "@/lib/media/sourceUrl";
import type { MediaType } from "@/lib/media/types";
import { COLUMNS, keywordQuery } from "./query";
import { bankPool } from "./pool";

export function socialMetadataQuery(codes: string[], keywords: string[]) {
  const searchable = [...new Set(keywords)].map((keyword) => ({ keyword, query: keywordQuery([keyword]) })).filter((entry) => entry.query);
  return {
    text: `SELECT p.post_code code, p.post_language language, p.post_url "sourceUrl",
       ARRAY(SELECT k.keyword FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS k(keyword, query, position)
             WHERE p.post_content_tsv @@ to_tsquery('simple', k.query) ORDER BY k.position) "matchedKeywords"
     FROM post_main p WHERE p.post_code = ANY($1)`,
    values: [codes, searchable.map((entry) => entry.keyword), searchable.map((entry) => entry.query)],
    keywordRestricted: searchable.length > 0,
  };
}

/** Admin-only details; match against the same indexed vector and query used by scope filters. */
export async function socialMetadata(codes: string[], keywords: string[]) {
  if (!codes.length) return new Map<string, { sourceUrl: string | null; language: string | null; matchedKeywords: string[]; keywordRestricted: boolean }>();
  const query = socialMetadataQuery(codes, keywords);
  const { rows } = await bankPool().query<{ code: string; sourceUrl: string | null; language: string | null; matchedKeywords: string[] }>(query.text, query.values);
  return new Map(rows.map(({ code, ...metadata }) => [code, { ...metadata, sourceUrl: safeSourceUrl(metadata.sourceUrl), keywordRestricted: query.keywordRestricted }]));
}

/** For each item code, the key keywords it mentions (same index and query as the scope filter). */
export async function matchedKeywords(type: MediaType, codes: string[], keywords: string[]) {
  const searchable = [...new Set(keywords)].map((keyword) => ({ keyword, query: keywordQuery([keyword]) })).filter((entry) => entry.query);
  if (!codes.length || !searchable.length) return new Map<string, string[]>();
  const c = COLUMNS[type];
  const { rows } = await bankPool().query<{ code: string; matched: string[] }>(
    `SELECT ${c.code} code, ARRAY(SELECT k.keyword FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS k(keyword, query, position)
       WHERE ${c.search} @@ to_tsquery('simple', k.query) ORDER BY k.position) matched
     FROM ${c.from.split(" LEFT JOIN")[0]} WHERE ${c.code} = ANY($1)`,
    [codes, searchable.map((e) => e.keyword), searchable.map((e) => e.query)],
  );
  return new Map(rows.map((r) => [r.code, r.matched]));
}
