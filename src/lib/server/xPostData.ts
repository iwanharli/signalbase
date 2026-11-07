import { z } from "zod";
import { safeSourceUrl } from "@/lib/media/sourceUrl";
import { decodeTextEntities } from "@/lib/media/text";
import type { XPostPreview } from "@/lib/media/xPost";

const count = z.number().finite().nonnegative().optional().catch(undefined);
const mediaSchema = z.object({
  type: z.enum(["photo", "video", "animated_gif"]), media_url_https: z.string(), ext_alt_text: z.string().optional(),
  video_info: z.object({ variants: z.array(z.object({ content_type: z.string(), url: z.string(), bitrate: z.number().optional() })) }).optional(),
});
const schema = z.object({
  id_str: z.string().regex(/^\d{1,40}$/), text: z.string().max(100_000), created_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  user: z.object({ name: z.string().max(200), screen_name: z.string().regex(/^[a-z0-9_]{1,30}$/i), profile_image_url_https: z.string().optional() }),
  parent: z.unknown().optional(),
  in_reply_to_status_id_str: z.string().regex(/^\d{1,40}$/).optional().catch(undefined),
  in_reply_to_screen_name: z.string().regex(/^[a-z0-9_]{1,30}$/i).optional().catch(undefined),
  favorite_count: count, conversation_count: count, reply_count: count,
  mediaDetails: z.array(mediaSchema).optional().catch([]), quoted_tweet: z.unknown().optional(), note_tweet: z.unknown().optional(),
});

function mediaUrl(value: string | undefined, host: string): string | null {
  const url = safeSourceUrl(value);
  return url && new URL(url).protocol === "https:" && new URL(url).hostname === host ? url : null;
}

/** Return only fields needed by the admin preview, never arbitrary upstream HTML. */
export function normalizeXPost(value: unknown, depth = 0, provider: XPostPreview["provider"] = "x"): XPostPreview | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return null;
  const tweet = parsed.data;
  const embeddedParent = depth === 0 && tweet.parent ? normalizeXPost(tweet.parent, depth + 1, provider) : null;
  const replyId = depth === 0 ? tweet.in_reply_to_status_id_str ?? embeddedParent?.id : null;
  const parent = embeddedParent?.id === replyId ? embeddedParent : null;
  const replyHandle = tweet.in_reply_to_screen_name ?? parent?.author.handle ?? null;
  const media: XPostPreview["media"] = [];
  for (const item of (tweet.mediaDetails ?? []).slice(0, 4)) {
    const poster = mediaUrl(item.media_url_https, "pbs.twimg.com");
    const video = item.video_info?.variants.filter((variant) => variant.content_type === "video/mp4").sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0)).find((variant) => mediaUrl(variant.url, "video.twimg.com"));
    const url = item.type === "photo" ? poster : video ? mediaUrl(video.url, "video.twimg.com") : poster;
    if (url) media.push({ kind: item.type !== "photo" && video ? "video" : "image", url, poster, alt: decodeTextEntities(item.ext_alt_text || "Media dari post X") });
  }
  return {
    provider, id: tweet.id_str, url: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`, text: decodeTextEntities(tweet.text),
    createdAt: new Date(tweet.created_at).toISOString(), fetchedAt: new Date().toISOString(),
    author: { name: decodeTextEntities(tweet.user.name), handle: tweet.user.screen_name, avatar: mediaUrl(tweet.user.profile_image_url_https, "pbs.twimg.com") },
    likes: tweet.favorite_count ?? null, replies: tweet.conversation_count ?? tweet.reply_count ?? null,
    isTruncated: !!tweet.note_tweet, media,
    replyTo: replyId && replyId !== tweet.id_str ? {
      id: replyId, handle: replyHandle,
      url: `https://x.com/${replyHandle || "i"}/status/${replyId}`, post: parent,
    } : null,
    quoted: depth === 0 && tweet.quoted_tweet ? normalizeXPost(tweet.quoted_tweet, depth + 1, provider) : null,
  };
}
