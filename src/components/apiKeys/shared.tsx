"use client";
// Types and small pieces shared by the API key list and the create page.
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import classes from "./apiKeys.module.css";

dayjs.extend(relativeTime);

export type ApiKeyRow = {
  id: string; name: string; prefix: string; keywords: string[];
  createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
};
export type CreatedKey = { name: string; key: string; keywords: string[] };

const RECENTLY_USED_MS = 24 * 60 * 60_000;

export const formatDate = (value: string) => dayjs(value).locale("id").format("D MMM YYYY, HH:mm");
export const fromNow = (value: string) => dayjs(value).locale("id").fromNow();
export const isRecentlyUsed = (key: ApiKeyRow) => !!key.lastUsedAt && Date.now() - new Date(key.lastUsedAt).getTime() < RECENTLY_USED_MS;

/** Human description of what a key with these keywords can read. */
export function scopeText(keywords: string[]) {
  if (!keywords.length) return "Kunci ini akan membaca seluruh bank data.";
  const list = keywords.length === 1 ? keywords[0] : `${keywords.slice(0, -1).join(", ")} atau ${keywords.at(-1)}`;
  return `Hanya post dan berita yang menyebut ${list}.`;
}

export function KeywordChips({ keywords }: { keywords: string[] }) {
  if (!keywords.length) return <div className={classes.chips}><span className={classes.chip} data-all>seluruh bank</span></div>;
  return <div className={classes.chips}>{keywords.map((w) => <span key={w} className={classes.chip}>{w}</span>)}</div>;
}
