import type { MediaItem, MediaType } from "./types";

/** Source links are navigable HTTP(S) URLs; social URLs are admin-only metadata. */
export function safeSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function sourceUrl(item: Pick<MediaItem, "url" | "socialMetadata">, type: MediaType): string | null {
  return safeSourceUrl(type === "social" ? item.socialMetadata?.sourceUrl : item.url);
}
