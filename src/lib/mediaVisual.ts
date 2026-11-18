// Media visual page (Analisis → Media visual): labels and shapes shared by the API and the page. The tags come from the
// local media worker (scripts/media/analisis_media.py); their codes must match TAGS there.
import type { MediaItem, MediaType } from "./media/types";

export const VISUAL_TAGS: Record<string, string> = {
  demo: "Demo / unjuk rasa", kerumunan: "Kerumunan", kericuhan: "Kericuhan", kebakaran: "Kebakaran", senjata: "Senjata",
  darah_luka: "Darah / luka", jenazah: "Jenazah", aparat: "Aparat berseragam", bencana: "Bencana", kecelakaan: "Kecelakaan",
  tangkapan_layar: "Tangkapan layar", dokumen: "Dokumen", poster: "Poster / grafis", meme: "Meme", infografis: "Infografis",
  pidato: "Pidato", rapat: "Rapat", kelompok: "Foto kelompok", orang: "Potret", makanan: "Makanan", pemandangan: "Pemandangan",
  olahraga: "Olahraga", kendaraan: "Kendaraan", logo: "Logo", produk: "Produk",
};
export const tagLabel = (tag: string) => VISUAL_TAGS[tag] ?? tag;

/** Where an image came from (MediaAsset.kind). */
export const VISUAL_KINDS = { news: "Berita online", x_photo: "Foto X", x_video: "Video X", youtube: "YouTube" } as const;
export type VisualKind = keyof typeof VISUAL_KINDS;
export const isVisualKind = (v: string | null): v is VisualKind => !!v && v in VISUAL_KINDS;

export const VISUAL_PERIODS = [{ days: 1, label: "24 jam" }, { days: 3, label: "3 hari" }, { days: 7, label: "7 hari" }, { days: 30, label: "30 hari" }] as const;
export const DEFAULT_VISUAL_DAYS = 3;
export const parseVisualDays = (v: string | null) => VISUAL_PERIODS.find((p) => String(p.days) === v)?.days ?? DEFAULT_VISUAL_DAYS;
export const VISUAL_PAGE_SIZE = 24;

/** A similar image (same near-duplicate group) and the newest post/article using it. */
export type VisualTwin = { id: string; url: string; kind: VisualKind; width: number | null; height: number | null; use: VisualUse };
export type VisualUse = { type: MediaType; code: string; source: string; publishedAt: string; item: MediaItem | null };
export type VisualAsset = {
  id: string; url: string; kind: VisualKind; width: number | null; height: number | null;
  tags: { tag: string; score: number }[]; sensitive: string[]; ocrText: string; ocrWords: number;
  /** The message of the image (see keyText): shown on cards, used by the "Ada teks" filter and the search. */
  keyText: string;
  /** From the key text: a call to action, the narrative key (same message on other pictures) and numeric claims. */
  actionCall: ActionCall | null; narrative: string | null; claims: string[];
  /** Items using this image, and the newest few of them. */
  usedBy: number; uses: VisualUse[];
  /** Other images (different URLs) with the same fingerprint: a picture being re-shared. */
  twins: number; lastSeen: string;
};
export type VisualStats = {
  total: number; withText: number; sensitive: number; tags: { tag: string; n: number }[]; pending: number;
  /** The project's older media are still being matched to its scope (new project or changed keywords). */
  syncing: boolean;
};
/** Health of the media worker, for admins: a heartbeat older than WORKER_STALE_MS means it has stopped. */
export type VisualWorker = { heartbeatAt: string; serviceOk: boolean; lastError: string | null; lastTick: { analyzed: number; ms: number } | null } | null;
export const WORKER_STALE_MS = 15 * 60_000;
/** Keyset cursor: the last image of a page (its newest use, as text, and its id). */
export type VisualCursor = { ts: string; id: string };
export function parseVisualCursor(v: string | null): VisualCursor | null {
  const m = v?.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6})~([A-Za-z0-9_.:-]{1,120})$/);
  return m ? { ts: m[1], id: m[2] } : null;
}
export const formatVisualCursor = (c: VisualCursor) => `${c.ts}~${c.id}`;
/** "post": one card per post/article with all its images (default); "image": one card per image (follow one picture). */
export type VisualView = "post" | "image" | "narrative";
export const parseVisualView = (v: string | null): VisualView => (v === "image" || v === "narrative" ? v : "post");
/** The same message (narrative key) on images of at least this many posts in the period: a shared narrative. */
export const NARRATIVE_MIN_POSTS = 3;
/** A shared narrative: posts whose images say the same thing, with one image as example. */
export type VisualNarrative = { key: string; posts: number; images: number; first: string; last: string; sample: { id: string; url: string; kind: VisualKind; width: number | null; height: number | null; keyText: string } };
/** One post or article and its analysed images (matching images first), with their text and tags merged. */
export type VisualPost = {
  key: string; type: MediaType; code: string; source: string; publishedAt: string; item: MediaItem | null;
  images: (VisualAsset & { position: number; matched: boolean })[];
  keyText: string; tags: { tag: string; score: number }[]; sensitive: string[];
  actionCall: ActionCall | null; claims: string[]; narratives: string[];
  /** Largest number of other URLs/posts sharing one of its images. */
  twins: number; sharedElsewhere: number;
};
export type VisualResponse = { days: number; view: VisualView; items: VisualAsset[]; posts: VisualPost[]; narratives: VisualNarrative[]; hasMore: boolean; next: string | null; stats: VisualStats; worker: VisualWorker };

/** Merged text of a post's images: their key texts in order, each line once. */
export function mergeKeyText(texts: string[]) {
  const seen = new Set<string>();
  return texts.flatMap((t) => t.split("\n")).filter((l) => {
    const k = l.trim().toLowerCase().replace(/\s+/g, " ");
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join("\n");
}

/** Merged tags of a post's images: each tag once with its best score, strongest first. */
export function mergeTags(lists: { tag: string; score: number }[][]) {
  const best = new Map<string, number>();
  for (const l of lists) for (const t of l) best.set(t.tag, Math.max(best.get(t.tag) ?? 0, t.score));
  return [...best].map(([tag, score]) => ({ tag, score })).sort((a, b) => b.score - a.score);
}

// ── Rules shared by the worker and its tests (pure) ───────────────────────────────────────────────────────────────────

/** YouTube thumbnail of a video URL (watch, youtu.be, shorts, embed); null when the URL has no video id. */
export function youtubeThumbnail(url: string | null | undefined) {
  const id = url?.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Images of an X post worth analysing: photos, and the poster frame of videos/GIFs; at most four. */
export function xPostImages(media: { kind: "image" | "video"; url: string; poster: string | null }[]) {
  return media.map((m) => (m.kind === "image" ? m.url : m.poster)).filter((u): u is string => !!u).slice(0, 4);
}

/** Wait before retrying a failed image: 5 min, 30 min, then 2 h; null after the last attempt. */
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000];
export function retryDelayMs(attemptsSoFar: number) {
  return attemptsSoFar >= 1 && attemptsSoFar <= RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attemptsSoFar - 1] : null;
}

/** Hamming distance between two 64-bit dHashes (hex). Same picture re-encoded, resized or with a small overlay: ≤ NEAR_TWIN_BITS. */
export const NEAR_TWIN_BITS = 6;
export function hashDistance(a: string, b: string) {
  let n = 0;
  // Two 32-bit halves (no BigInt): popcount of the XOR.
  for (const [i, j] of [[0, 8], [8, 16]]) {
    let x = (parseInt(a.slice(i, j), 16) ^ parseInt(b.slice(i, j), 16)) >>> 0;
    while (x) { n += x & 1; x >>>= 1; }
  }
  return n;
}

/** A news outlet's default picture: the same image on at least this many articles of one outlet. */
export const PLACEHOLDER_MIN_ARTICLES = 5;

/** Analysis order: social media first (X photos carry ~5× more text than news photos in tests), then news. */
export const KIND_PRIORITY: Record<VisualKind, number> = { x_photo: 0, x_video: 1, youtube: 2, news: 3 };

// ── "Teks penting" from OCR lines ─────────────────────────────────────────────────────────────────────────────────────

export type OcrLine = { t: string; h: number; cy: number };

const MONTH = "(jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec)[a-z]*";
/** App chrome and camera stamps: lines that are never the message of an image. */
const NOISE = [
  /^(lihat|tampilkan|show|view)\s+(\d+\s+)?(balasan|komentar|replies|reply|more|lainnya|terjemahan|translation)\b/i,
  /^(balas|reply|suka|like|likes|bagikan|share|ikuti|follow|following|mengikuti|terjemahkan|translate|repost|kutip|quote|simpan|save|kirim|send|selengkapnya|more|lainnya|baca selengkapnya)$/i,
  /^[\d\s.,:·•|+\-–%()]*(\d\s*(rb|jt|k|m|b|ribu|juta))?[\d\s.,:·•|+\-–%()]*$/i, // counters "25.1rb · 1.1rb · 513", lone numbers
  /^\d+\s*(dtk|detik|mnt|menit|jam|j|hari|h|minggu|mgg|bulan|bln|tahun|thn|s|m|d|w|y|hr|hrs|min|mins)(\s+(yang\s+)?lalu)?$/i, // "3 hari", "2j"
  /^\d{1,2}[.:]\d{2}(\s*(wib|wita|wit|am|pm))?$/i,
  /^[\w.]{2,30}\s*[·•]?\s*\d+\s*(dtk|detik|mnt|menit|jam|j|hari|h|minggu|mgg|bulan|bln|tahun|thn|s|m|d|w|y)(\s+(yang\s+)?lalu)?$/i, // reply header "bibmaul 3 hari"
  new RegExp(`\\b\\d{1,2}\\s+${MONTH}\\s+\\d{4}\\b.*\\d{1,2}[.:]\\d{2}`, "i"), // camera stamp "18 Nov 2026 09.23.51 …"
  /^\d{4}[-/]\d{2}[-/]\d{2}([ T]\d{2}[:.]\d{2}.*)?$/,
  /^[^\s@]{0,40}\s*@\w{2,}\s*([·.•-].*)?$/, // "Kanda @kandaabahlul · 4 jam", "@akun"
  /^(https?:\/\/)?(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i, // a bare domain or link
];
/** Lines shorter than this (share of the image height) are background text: shirts, signs, small print. */
export const KEY_MIN_LINE_HEIGHT = 0.015;
/** A line is a repeat of the caption when this share of its words is in the caption. */
const CAPTION_OVERLAP = 0.7;
/** Fewer meaningful words than this left: the image counts as having no text. */
export const KEY_MIN_WORDS = 4;

const words = (s: string) => (s.toLowerCase().match(/\p{L}{3,}/gu) ?? []);

/** The OCR lines that carry a message, and how many meaningful words they hold (0 = treat the image as without text). */
export function keyText(lines: OcrLine[], context: string | null | undefined) {
  const caption = new Set(words(context ?? ""));
  const kept = lines.filter((l) => {
    const t = l.t.trim();
    if (!t || NOISE.some((re) => re.test(t))) return false;
    if (l.h > 0 && l.h < KEY_MIN_LINE_HEIGHT) return false;
    const w = words(t);
    if (!w.length) return false;
    if (caption.size && w.filter((x) => caption.has(x)).length / w.length >= CAPTION_OVERLAP) return false;
    return true;
  }).map((l) => l.t.trim());
  const n = kept.reduce((sum, l) => sum + words(l).length, 0);
  return n >= KEY_MIN_WORDS ? { text: kept.join("\n"), words: n } : { text: "", words: 0 };
}

// ── Reading OCR text ──────────────────────────────────────────────────────────────────────────────────────────────────

export type TextBlock = { kind: "headline" | "text"; text: string };

/** Mostly capitals (≥ 70% of its letters, at least 3): a headline line of a poster or thumbnail. */
const isHeadline = (line: string) => {
  const letters = line.match(/\p{L}/gu) ?? [];
  return letters.length >= 3 && letters.filter((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase()).length / letters.length >= 0.7;
};

/** OCR lines back into readable blocks: consecutive headline lines form one headline, a sentence broken over lines is
 *  joined until it ends with punctuation. */
export function reflowOcr(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const kind = isHeadline(line) ? "headline" : "text";
    const last = blocks.at(-1);
    const open = last && !/[.!?:;"”)]$/.test(last.text);
    if (last && last.kind === kind && (kind === "headline" || open)) last.text += ` ${line}`;
    else blocks.push({ kind, text: line });
  }
  return blocks;
}

// ── What the key text says: calls to action, shared narratives, numeric claims ───────────────────────────────────────

const DAYS = "senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad";
const MONTHS = "januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sep|okt|nov|des";
/** Words that call people out (protest, rally, march, besiege…), not just reporting one. */
const ACTION_WORDS = /\b(aksi|demo|demonstrasi|unjuk\s*rasa|turun\s*ke\s*jalan|turun\s*jalan|geruduk|kepung|long\s*march|mogok|boikot|bela|seruan|ayo|mari|serbu|rapatkan\s*barisan|konsolidasi|apel\s*akbar|aksi\s*damai|aksi\s*massa)\b/i;
const DATE_RE = new RegExp(`\\b((${DAYS}),?\\s*)?(\\d{1,2}\\s*(${MONTHS})\\b|\\d{1,2}[/-]\\d{1,2}([/-]\\d{2,4})?)|\\b(${DAYS})\\b`, "i");
const TIME_RE = /\b(pukul|jam|pkl\.?)\s*\d{1,2}([.:]\d{2})?\s*(wib|wita|wit)?\b|\b\d{1,2}[.:]\d{2}\s*(wib|wita|wit)\b/i;
const PLACE_RE = /\b(titik\s*kumpul|lokasi|tempat|depan\s+(gedung|kantor|istana)|gedung|bundaran|lapangan|alun-alun|monas|istana|dprd?|mapolda|mapolres|polda|polres|kantor\s+\w+|jl\.?\s+\w+|jalan\s+\w+)\b/i;

export type ActionCall = { words: string[]; date: string | null; time: string | null; place: string | null };

/** A call to action in an image: an action word plus a date, a time or a meeting place (posters announcing a rally). */
export function detectActionCall(text: string): ActionCall | null {
  if (!text) return null;
  const word = text.match(new RegExp(ACTION_WORDS.source, "gi"));
  if (!word) return null;
  const date = text.match(DATE_RE)?.[0] ?? null, time = text.match(TIME_RE)?.[0] ?? null, place = text.match(PLACE_RE)?.[0] ?? null;
  if (!date && !time && !place) return null;
  // One weak hint (a weekday alone, or a place alone) needs a second one: "aksi" + "gedung" is too common in news photos.
  const strong = (date && !new RegExp(`^(${DAYS})$`, "i").test(date.trim())) || time;
  if (!strong && !(date && place)) return null;
  return { words: [...new Set(word.map((w) => w.toLowerCase().replace(/\s+/g, " ")))].slice(0, 5), date: date?.trim() ?? null, time: time?.trim() ?? null, place: place?.trim() ?? null };
}

/** Fingerprint of an image's message for spotting the same narrative across different pictures: the first 12
 *  meaningful words, normalised. null when the text is too short to be a narrative (fewer than 8 words). */
export function narrativeKey(text: string) {
  const w = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) ?? [];
  return w.length >= 8 ? w.slice(0, 12).join(" ") : null;
}

const UNIT = "(%|persen|ribu|rb|juta|jt|miliar|milyar|triliun|t|orang|jiwa|warga|korban|perusahaan|titik|hektar|ha|km|kg|ton|unit|kasus|rumah|desa|sekolah|tersangka|personel|rupiah)";
const CLAIM_RE = new RegExp(`(rp\\.?\\s*\\d[\\d.,]*\\s*(ribu|rb|juta|jt|miliar|triliun|t)?|\\b\\d[\\d.,]*\\s*${UNIT}(?![\\p{L}\\d]))`, "iu");

/** Lines of the key text that state a number with a unit (amounts, percentages, counts): claims worth checking. */
export function numericClaims(text: string) {
  return text.split("\n").map((l) => l.trim()).filter((l) => l.length >= 6 && CLAIM_RE.test(l)).slice(0, 8);
}
