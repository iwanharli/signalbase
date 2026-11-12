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

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * video.twimg.com answers 403 when the request carries another site's Referer, and <video> has no referrerpolicy
 * attribute. A srcdoc frame sets its own "no-referrer" policy, so the player loads the file as if opened directly.
 * The aspect ratio comes from the size in the file path (…/1080x1920/…), 16:9 when absent.
 */
export function xVideoFrame(url: string, poster: string | null) {
  const size = url.match(/\/(\d{2,4})x(\d{2,4})\//);
  const srcDoc = `<!doctype html><meta name="referrer" content="no-referrer"><style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain}</style>`
    + `<video src="${escapeAttr(url)}"${poster ? ` poster="${escapeAttr(poster)}"` : ""} controls preload="none" playsinline></video>`;
  return { srcDoc, style: { aspectRatio: size ? `${size[1]} / ${size[2]}` : "16 / 9" } };
}

export type XPostPreview = {
  provider: "x" | "fxtwitter";
  id: string; url: string; text: string; createdAt: string; fetchedAt: string;
  author: { name: string; handle: string; avatar: string | null };
  likes: number | null; replies: number | null; isTruncated: boolean;
  media: { kind: "image" | "video"; url: string; poster: string | null; alt: string }[];
  quoted: XPostPreview | null;
  replyTo: { id: string; handle: string | null; url: string; post: XPostPreview | null } | null;
};
