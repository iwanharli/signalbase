import { getTweet } from "react-tweet/api";
import { createCache } from "./bank/cache";
import { normalizeXPost } from "./xPostData";
import { normalizeFxPost } from "./fxPostData";
import type { XPostPreview } from "@/lib/media/xPost";
import { isXPostId } from "@/lib/media/xPost";

const cachedTweet = createCache<XPostPreview | null>({ ttlMs: 5 * 60_000, maxEntries: 300 });

async function fromX(id: string) {
  const tweet = await getTweet(id, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!tweet) return null;
  const result = normalizeXPost(tweet);
  if (!result || result.id !== id) throw new Error("Invalid X response");
  return result;
}

async function fromFxTwitter(id: string) {
  const response = await fetch(`https://api.fxtwitter.com/status/${id}`, {
    signal: AbortSignal.timeout(8_000), cache: "no-store", redirect: "error",
    headers: { Accept: "application/json", "User-Agent": "Signalbase/0.1 (admin post preview)" },
  });
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error("FxTwitter unavailable");
  const data = await response.json();
  if (data?.code === 404 || data?.code === 401) return null;
  if (data?.code !== 200) throw new Error("FxTwitter unavailable");
  const result = normalizeFxPost(data.tweet);
  if (!result || result.id !== id) throw new Error("Invalid FxTwitter response");
  return result;
}

/** Try fixed, trusted providers in order. Cache valid results, never transient failures. */
export function originalXPost(id: string) {
  if (!isXPostId(id)) throw new Error("Invalid X post id");
  return cachedTweet(id, async () => {
    let failed = false;
    let primary: XPostPreview | null = null;
    try {
      primary = await fromX(id);
      if (primary && !primary.isTruncated) return primary;
    } catch { failed = true; }
    try {
      const post = await fromFxTwitter(id);
      if (post && (!primary || !post.isTruncated || post.text.length > primary.text.length)) return post;
    } catch { failed = true; }
    // A partial post remains useful if the alternate source is unavailable.
    if (primary) return primary;
    // Only cache a missing post when both providers confirmed it is unavailable.
    if (failed) throw new Error("Post providers unavailable");
    return null;
  });
}
