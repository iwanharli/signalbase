"use client";
// Types and small pieces shared by the API key list and the create page.
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import type { KeyScope } from "@/lib/media/keyScope";
import { capitalize, humanize, MEDIA_TYPE_LABEL } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import type { FilterOptions } from "@/lib/media/types";
import classes from "./apiKeys.module.css";

dayjs.extend(relativeTime);

export type ApiKeyRow = {
  id: string; name: string; prefix: string; keywords: string[]; scope: KeyScope;
  createdBy: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
  classifier: { enabled: boolean; processed: number; lastError: string | null; providerName: string } | null;
  /** The full value is stored encrypted and can be copied (false for keys made before that). */
  copyable: boolean;
};
export type CreatedKey = { name: string; key: string; scope: KeyScope };

const RECENTLY_USED_MS = 24 * 60 * 60_000;

export const formatDate = (value: string) => dayjs(value).locale("id").format("D MMM YYYY, HH:mm");
export const fromNow = (value: string) => dayjs(value).locale("id").fromNow();
export const isRecentlyUsed = (key: ApiKeyRow) => !!key.lastUsedAt && Date.now() - new Date(key.lastUsedAt).getTime() < RECENTLY_USED_MS;

export const RELEVANCE_SCOPE_LABEL = { relevant: "Hanya relevan", include: "Hanya include", watchlist: "Hanya watchlist" } as const;
export const LANGUAGE_SCOPE_LABEL = { id: "Bahasa Indonesia", other: "Bahasa lain" } as const;

/** Province code → name, loaded once from the filter options. */
export function useProvinceNames() {
  const options = useApi<FilterOptions>("/api/admin/media/social?view=options");
  const names = new Map((options.data?.provinces ?? []).map((p) => [p.value, p.label]));
  return (code: string) => names.get(code) ?? `Provinsi ${code}`;
}

/** Human description of which keywords a key matches. */
export function keywordText(keywords: string[]) {
  if (!keywords.length) return "Tidak dibatasi kata kunci";
  const list = keywords.length === 1 ? keywords[0] : `${keywords.slice(0, -1).join(", ")} atau ${keywords.at(-1)}`;
  return `Menyebut ${list}`;
}

/** Every restriction of a scope as short labels, keywords excluded. */
export function scopeRestrictions(scope: KeyScope, provinceName: (code: string) => string): string[] {
  const parts: string[] = [];
  if (scope.types.length === 1) parts.push(`Hanya ${MEDIA_TYPE_LABEL[scope.types[0]]}`);
  if (scope.analyzedOnly) parts.push("Sudah dianalisis");
  if (scope.relevance) parts.push(RELEVANCE_SCOPE_LABEL[scope.relevance]);
  if (scope.language) parts.push(LANGUAGE_SCOPE_LABEL[scope.language]);
  if (scope.minLevel) parts.push(`Intensitas ≥ ${scope.minLevel}`);
  if (scope.provinces.length) parts.push(scope.provinces.length <= 2 ? scope.provinces.map(provinceName).join(", ") : `${scope.provinces.length} provinsi`);
  if (scope.categories.length) parts.push(scope.categories.length <= 3 ? scope.categories.map((c) => capitalize(humanize(c))).join(", ") : `${scope.categories.length} kategori`);
  return parts;
}

export function KeywordChips({ keywords }: { keywords: string[] }) {
  if (!keywords.length) return <div className={classes.chips}><span className={classes.chip} data-all>tidak dibatasi kata kunci</span></div>;
  return <div className={classes.chips}>{keywords.map((w) => <span key={w} className={classes.chip}>{w}</span>)}</div>;
}

export function RestrictionChips({ restrictions }: { restrictions: string[] }) {
  if (!restrictions.length) return <div className={classes.chips}><span className={classes.chip} data-all>tanpa batasan lain</span></div>;
  return <div className={classes.chips}>{restrictions.map((r) => <span key={r} className={classes.chip} data-kind="filter">{r}</span>)}</div>;
}
