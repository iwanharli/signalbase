// Tells a social account run by a news outlet or an institution from an ordinary public account, so Ringkasan AI can read
// the public's own voice instead of outlets reposting their headlines. A heuristic on the username only: outlet brands
// taken from the news sources in the bank, plus common naming patterns.

export type AccountKind = "media" | "institusi" | "publik";

/** Source-name tokens that are not a brand (generic words and regions), so "jogja" in jogja_tribunnews_com never marks an account. */
const GENERIC = new Set([
  "news", "berita", "harian", "koran", "media", "online", "indonesia", "times", "daily", "www", "radar",
  "jatim", "jabar", "jateng", "jogja", "sumbar", "sumut", "sumsel", "sulsel", "kalsel", "kalteng", "kalbar", "kaltim", "ambon", "aceh",
  "palu", "banjarmasin", "bengkulu", "pontianak", "makassar", "bali", "riau", "papua", "medan", "surabaya", "bandung", "jakarta",
  "lampung", "banten", "sumbawa", "malang", "semarang", "solo", "batam", "manado", "kupang", "mataram", "padang", "jambi",
]);

/** Outlet brands from news source names: "pikiran_rakyat" → pikiranrakyat, "news-detik" → detik, "kompas" → kompas. */
export function mediaBrands(sources: string[]): string[] {
  const brands = new Set<string>();
  for (const source of sources) {
    const tokens = source.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !["com", "co", "id", "net", "org", "en"].includes(t));
    const joined = tokens.filter((t) => !GENERIC.has(t)).join("");
    if (joined.length >= 5) brands.add(joined);
    for (const t of tokens) if (t.length >= 5 && !GENERIC.has(t)) brands.add(t);
  }
  return [...brands];
}

// Government bodies, police and military, big state or corporate brands, and platform bots (meta.ai on Threads).
const INSTITUTION = /^meta\.ai$|(^|[._])(ri|go|gov)$|kemen|polri|polda|polres|polsek|humas|pemkot|pemkab|pemprov|kominfo|komdigi|bnpb|bpbd|basarnas|kodam|kodim|^tni|^dpr|^mpr|^bank|^bni$|^bri$|^bca$|mandiri|pertamina|^pln|telkomsel|indihome/;
// News, info and channel accounts ("detiknewsofficial", "makassar_iinfo", "suaradotcom", "kompastv", "faktanewss.id").
const MEDIA = /news|berita|media|warta|kabar|info|channel|dotcom|dotco|terkini|terciduk|update|viral|^tv|tv$|tv[._]|com$|\.id$|_id$/;

export function accountKind(username: string | null | undefined, brands: readonly string[]): AccountKind {
  const u = (username ?? "").toLowerCase().trim();
  if (!u) return "publik";
  if (INSTITUTION.test(u)) return "institusi";
  const plain = u.replace(/[^a-z0-9]/g, "");
  if (MEDIA.test(u) || brands.some((b) => plain.includes(b))) return "media";
  return "publik";
}
