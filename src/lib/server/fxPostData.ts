import { z } from "zod";
import { xPostId } from "@/lib/media/xPost";
import { normalizeXPost } from "./xPostData";

const count = z.number().finite().nonnegative().optional().catch(undefined);
const media = z.object({
  type: z.enum(["photo", "video", "gif"]).optional(), url: z.string(), thumbnail_url: z.string().optional(),
  format: z.string().optional(), altText: z.string().optional(), alt_text: z.string().optional(),
});
const schema = z.object({
  id: z.string().regex(/^\d{1,40}$/).optional(), url: z.string().optional(), text: z.string().max(100_000),
  created_at: z.string(),
  author: z.object({ name: z.string(), screen_name: z.string(), avatar_url: z.string().optional() }),
  likes: count, replies: count,
  replying_to: z.string().nullable().optional(), replying_to_status: z.string().nullable().optional(),
  media: z.object({ all: z.array(media).optional(), photos: z.array(media).optional(), videos: z.array(media).optional() }).nullable().optional().catch(null),
  quote: z.unknown().optional(),
});

/** Adapt FxTwitter to the same validated preview shape, including media host restrictions. */
function convert(value: unknown, depth = 0): unknown {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return null;
  const post = parsed.data;
  const id = post.id ?? xPostId(post.url);
  if (!id) return null;
  const entries = post.media?.all?.length ? post.media.all : [
    ...(post.media?.photos ?? []).map((item) => ({ ...item, type: "photo" as const })),
    ...(post.media?.videos ?? []).map((item) => ({ ...item, type: item.type ?? "video" as const })),
  ];
  return {
    id_str: id, text: post.text, created_at: post.created_at,
    user: { name: post.author.name, screen_name: post.author.screen_name, profile_image_url_https: post.author.avatar_url },
    favorite_count: post.likes, conversation_count: post.replies,
    in_reply_to_status_id_str: post.replying_to_status ?? undefined, in_reply_to_screen_name: post.replying_to ?? undefined,
    mediaDetails: entries.map((item) => ({
      type: item.type === "photo" ? "photo" : item.type === "gif" ? "animated_gif" : "video",
      media_url_https: item.type === "photo" ? item.url : item.thumbnail_url ?? "",
      ext_alt_text: item.altText ?? item.alt_text,
      ...(item.type !== "photo" ? { video_info: { variants: [{ content_type: item.format ?? "video/mp4", url: item.url }] } } : {}),
    })),
    quoted_tweet: depth === 0 && post.quote ? convert(post.quote, depth + 1) : undefined,
  };
}

export function normalizeFxPost(value: unknown) {
  return normalizeXPost(convert(value), 0, "fxtwitter");
}
