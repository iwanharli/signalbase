// Which "original post" viewer a social item can have, from the post's own URL.
import type { MediaItem } from "./types";
import { metaPost, type MetaPost } from "./metaPost";
import { publicVideo, type PublicVideo } from "./publicVideo";
import { threadsPost, type ThreadsPost } from "./threadsPost";
import { xPostId } from "./xPost";

export type Original =
  | { kind: "x"; id: string }
  | { kind: "video"; video: PublicVideo }
  | { kind: "threads"; post: ThreadsPost }
  | { kind: "meta"; post: MetaPost };

export function originalOf(item: Pick<MediaItem, "socialMetadata">): Original | null {
  const url = item.socialMetadata?.sourceUrl;
  const id = xPostId(url), video = publicVideo(url), threads = threadsPost(url), meta = metaPost(url);
  return id ? { kind: "x", id } : video ? { kind: "video", video } : threads ? { kind: "threads", post: threads } : meta ? { kind: "meta", post: meta } : null;
}
