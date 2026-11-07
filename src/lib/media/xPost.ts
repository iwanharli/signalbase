import { safeSourceUrl } from "./sourceUrl";

/** Extract only a numeric X post id; never forward arbitrary user-provided URLs. */
export function xPostId(value: string | null | undefined): string | null {
  const href = safeSourceUrl(value);
  if (!href) return null;
  const url = new URL(href);
  const hosts = ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "m.twitter.com"];
  if (!hosts.includes(url.hostname.toLowerCase()) || (url.port && url.port !== "443" && url.port !== "80")) return null;
  return url.pathname.match(/^\/(?:[^/]+\/status|i\/web\/status)\/(\d{1,40})(?:\/|$)/)?.[1] ?? null;
}

export const isXPostId = (value: string) => /^\d{1,40}$/.test(value);

export type XPostPreview = {
  provider: "x" | "fxtwitter";
  id: string; url: string; text: string; createdAt: string; fetchedAt: string;
  author: { name: string; handle: string; avatar: string | null };
  likes: number | null; replies: number | null; isTruncated: boolean;
  media: { kind: "image" | "video"; url: string; poster: string | null; alt: string }[];
  quoted: XPostPreview | null;
  replyTo: { id: string; handle: string | null; url: string; post: XPostPreview | null } | null;
};
