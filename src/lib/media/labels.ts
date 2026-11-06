// User-facing labels (Indonesian) and small formatting helpers for media data.
import type { MediaType, Relevance } from "./types";

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = { social: "Media Sosial", online: "Media Online" };
export const MOOD_KIND_LABEL: Record<MediaType, string> = { social: "Emosi", online: "Sentimen" };
export const SOURCE_KIND_LABEL: Record<MediaType, string> = { social: "Platform", online: "Media" };

const PLATFORM_LABEL: Record<string, string> = {
  twitter: "X / Twitter", threads: "Threads", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube",
};

export const POST_TYPE_LABEL: Record<string, string> = { post: "Post", reply: "Balasan", quote: "Kutipan", repost: "Repost" };

export const FACTOR_LABEL: Record<string, string> = {
  jenis: "Jenis", korban: "Korban", pelaku: "Pelaku", kerugian: "Kerugian", intensitas: "Intensitas",
};

export const RELEVANCE_LABEL: Record<Relevance, string> = { include: "Relevan", watchlist: "Watchlist", exclude: "Tidak relevan" };

/** "kejahatan_siber" → "kejahatan siber" */
export const humanize = (value: string) => value.replace(/_/g, " ");

export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Platform name for social sources; tidied outlet name for news sources ("news-kompas" → "Kompas"). */
export const sourceLabel = (source: string) =>
  PLATFORM_LABEL[source] ?? humanize(source.replace(/^news-/, "")).replace(/\b\w/g, (c) => c.toUpperCase());

export const formatNumber = (n: number) => Math.round(n).toLocaleString("id-ID");
