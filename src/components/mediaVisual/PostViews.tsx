"use client";
// Media visual, per post: a card shows a post's images as a collage (1 full, 2 side by side, 3 one big + two, 4 as 2×2)
// with their text and tags merged; the modal shows every image with its own text and tags. Images that match the
// filters come first (the server sorts them).
import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { IconAlertTriangle, IconCopy, IconExternalLink, IconEyeOff, IconFileText, IconMicrophone, IconPhoto, IconPhotoScan, IconStack2, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { formatNumber, sourceLabel } from "@/lib/media/labels";
import { tagLabel, videoFrame, VISUAL_KINDS, type VisualPost } from "@/lib/mediaVisual";
import m from "../media/modal.module.css";
import c from "./mediaVisual.module.css";
import { Marked, OcrText } from "./OcrText";
import { VisualImage } from "./VisualImage";
import { Twins } from "./Twins";
import { SignalBadges, SignalSections } from "./Signals";
import type { MediaItem, MediaType } from "@/lib/media/types";

dayjs.extend(relativeTime);
const ago = (iso: string) => dayjs(iso).locale("id").fromNow();
const MAX_TILES = 4;
type Img = VisualPost["images"][number];

const ratio = (i: Img) => (i.width && i.height ? Math.min(2, Math.max(0.75, i.width / i.height)) : 16 / 10);
/** Width/height of a post's collage: a single photo keeps its own shape; several share a fixed frame. */
export const collageRatio = (p: VisualPost) => (p.images.length <= 1 ? (p.images[0] ? ratio(p.images[0]) : 16 / 10) : p.images.length === 2 ? 1.6 : 1.25);

function countLabel(p: VisualPost) {
  // A video counts once: its poster, its frames ("#t=") and YouTube's thumbnail + frames are all of one video.
  const frames = p.images.some((i) => videoFrame(i.url));
  const isVideo = (i: VisualPost["images"][number]) => i.kind === "x_video" || i.kind === "youtube" || !!videoFrame(i.url) || (frames && i.position === 0);
  const videos = p.images.some(isVideo) ? 1 : 0;
  const photos = p.images.filter((i) => !isVideo(i)).length;
  return [videos && `${videos} video`, photos && `${photos} foto`].filter(Boolean).join(" + ");
}

function Tile({ img, blur, more }: { img: Img; blur: boolean; more?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={c.tile}>
      {broken ? <span className={c.broken}><IconPhoto size={18} /></span>
        : <VisualImage src={img.url} loading="lazy" onError={() => setBroken(true)} data-blur={blur || undefined} />}
      {more ? <span className={c.more}>+{more}</span> : null}
    </span>
  );
}

export function PostCard({ post, onOpen }: { post: VisualPost; onOpen: () => void }) {
  const hidden = post.sensitive.length > 0;
  const shown = post.images.slice(0, MAX_TILES);
  const many = post.images.length > 1;
  return (
    <button type="button" className={c.card} onClick={onOpen} data-sensitive={hidden || undefined}>
      <span className={c.thumb} style={{ aspectRatio: String(collageRatio(post)) }}>
        <span className={c.collage} data-n={Math.min(MAX_TILES, post.images.length)}>
          {shown.map((img, i) => <Tile key={img.id} img={img} blur={hidden} more={i === MAX_TILES - 1 && post.images.length > MAX_TILES ? post.images.length - MAX_TILES : undefined} />)}
        </span>
        <span className={c.badges}>
          <span className={c.kind}>{post.images[0] ? VISUAL_KINDS[post.images[0].kind] : sourceLabel(post.source)}</span>
          {many && <span className={c.kind}><IconStack2 size={11} />{countLabel(post)}</span>}
          {hidden && <span className={c.warnBadge}><IconAlertTriangle size={11} />Perlu ditinjau</span>}
          <SignalBadges action={post.actionCall} claims={post.claims.length} unread={post.unreadText && !post.keyText} speech={!!post.transcript} />
        </span>
        {post.twins > 0 && <span className={c.twins} title="Gambar yang sama ditemukan di URL lain"><IconCopy size={11} />{post.twins + 1}×</span>}
        {hidden && <span className={c.veil}><IconEyeOff size={18} />Kemungkinan konten sensitif<small>Klik untuk melihat</small></span>}
      </span>
      <span className={c.body}>
        <span className={c.tagLine}>
          {post.tags.length ? post.tags.filter((t) => !post.sensitive.includes(t.tag)).slice(0, 3).map((t) => <span key={t.tag}>{tagLabel(t.tag)}</span>) : <em>Tanpa tag</em>}
        </span>
        <span className={c.ocr} data-empty={!post.keyText || undefined}>
          {post.keyText ? <><IconFileText size={12} />{post.keyText.replace(/\s+/g, " ")}</> : "Tidak ada teks penting di gambar"}
        </span>
        <span className={c.foot}>
          <span className={c.footSource}>{sourceLabel(post.source)}</span>
          <span>{post.sharedElsewhere > 0 ? `+${formatNumber(post.sharedElsewhere)} post lain · ` : ""}{ago(post.publishedAt)}</span>
        </span>
      </span>
    </button>
  );
}

type Open = (item: MediaItem, type: MediaType) => void;

export function PostModal({ post, onClose, onZoom, onOpenItem, onOpenOther, onNarrative, highlight }: { post: VisualPost | null; onClose: () => void; onZoom: (index: number) => void; onOpenItem: () => void; onOpenOther: Open; onNarrative: (key: string) => void; highlight?: string }) {
  const [last, setLast] = useState<VisualPost | null>(post);
  const reducedMotion = useReducedMotion();
  useEffect(() => { if (post) setLast(post); }, [post]);
  const p = post ?? last;
  const tone = p?.sensitive.length ? "var(--mantine-color-orange-6)" : "var(--mantine-color-violet-6)";
  return (
    <Modal.Root opened={!!post} onClose={onClose} size={DETAIL_MODAL_SIZE} radius={20} padding={0} centered yOffset={16} xOffset={12}
      transitionProps={{ transition: "fade", duration: reducedMotion ? 0 : 160 }}>
      <Modal.Overlay backgroundOpacity={0.48} blur={3} />
      <Modal.Content className={m.content} aria-label="Detail media post" style={{ ["--tone" as string]: tone }}>
        <Modal.Body>{p && <PostDetail key={p.key} post={p} onClose={onClose} onZoom={onZoom} onOpenItem={onOpenItem} onOpenOther={onOpenOther} onNarrative={onNarrative} highlight={highlight} />}</Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

function PostDetail({ post, onClose, onZoom, onOpenItem, onOpenOther, onNarrative, highlight }: { post: VisualPost; onClose: () => void; onZoom: (index: number) => void; onOpenItem: () => void; onOpenOther: Open; onNarrative: (key: string) => void; highlight?: string }) {
  const [revealed, setRevealed] = useState(post.sensitive.length === 0);
  const text = post.item ? (post.item.title ?? post.item.content ?? "") : "";
  return (
    <div className={`${m.shell} ${c.detailShell}`}>
      <header className={m.header}>
        <span className={m.avatar} aria-hidden><IconPhotoScan size={20} /></span>
        <div className={m.heading}>
          <h2 className={m.title}>{sourceLabel(post.source)}<span className={c.headSource}>{countLabel(post) || "media"}</span></h2>
          <p className={m.subtitle}>
            <span>{ago(post.publishedAt)}</span>
            {post.sharedElsewhere > 0 && <span>gambarnya juga dipakai {formatNumber(post.sharedElsewhere)} post lain</span>}
            {post.twins > 0 && <span>gambar mirip di {post.twins} URL lain</span>}
          </p>
        </div>
        <div className={m.headerActions}>
          <button type="button" data-autofocus className={m.close} onClick={onClose} aria-label="Tutup detail"><IconX size={18} aria-hidden /></button>
        </div>
      </header>

      <div className={`${m.columns} ${c.detailColumns}`}>
        <section className={m.mainCol} aria-label="Gambar">
          <div className={c.gallery} data-n={Math.min(4, post.images.length)}>
            {post.images.map((img, i) => (
              <button key={img.id} type="button" className={c.galleryItem} onClick={() => (revealed ? onZoom(i) : setRevealed(true))} aria-label={revealed ? `Perbesar gambar ${i + 1}` : "Tampilkan gambar sensitif"}>
                <VisualImage src={img.url} data-blur={(!revealed && img.sensitive.length > 0) || undefined} />
                {post.images.length > 1 && <span className={c.galleryNo}>{i + 1}</span>}
                {!revealed && img.sensitive.length > 0 && <span className={c.veil}><IconEyeOff size={20} />Kemungkinan konten sensitif<small>Klik untuk menampilkan</small></span>}
              </button>
            ))}
          </div>

          {post.images.length === 1 && <MediaInfo img={post.images[0]} />}
          {post.images.map((img, i) => (
            <Twins key={img.id} assetId={img.id} count={img.twins} label={post.images.length > 1 ? `Gambar ${i + 1}` : undefined} onPost={onOpenOther} />
          ))}
        </section>

        <aside className={m.sideCol} aria-label="Post dan analisis">
          <Summary tags={post.tags} sensitive={post.sensitive} action={!!post.actionCall} claims={post.claims.length} unread={post.unreadText && !post.keyText} />
          <section className={m.contextSection}>
            <h3>{post.type === "social" ? "Post" : "Berita"}</h3>
            {post.item ? (
              <>
                <PostText text={text} />
                <button type="button" className={c.openPost} onClick={onOpenItem}><IconExternalLink size={14} />Buka detail {post.type === "social" ? "post" : "berita"}</button>
              </>
            ) : <p className={m.sectionNote}>Item tidak ditemukan di bank data.</p>}
          </section>
          {post.transcript && <Transcript text={post.transcript} lang={post.transcriptLang} highlight={highlight} />}
          {post.images.map((img, i) => (post.images.length > 1 && !img.keyText && !img.ocrText ? null : (
            <section key={img.id} className={m.contextSection}>
              <h3><IconFileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{post.images.length > 1 ? `Teks di gambar ${i + 1}` : "Teks penting di gambar"}</h3>
              {post.images.length > 1 && img.tags.length > 0 && <div className={c.tags}>{img.sensitive.length > 0 && <span data-tone="warn"><IconAlertTriangle size={11} />Perlu ditinjau</span>}{img.tags.map((t) => <span key={t.tag} title={`Keyakinan ${Math.round(t.score * 100)}%`}>{tagLabel(t.tag)}</span>)}</div>}
              <OcrText keyText={img.keyText} ocrText={img.ocrText} ocrWords={img.ocrWords} highlight={highlight}
                emptyNote={img.unreadText ? "Ada teks beraksara lain (mis. Arab, Kirill, Mandarin) yang belum bisa dibaca; periksa gambarnya." : img.ocrText ? "Hanya teks tampilan aplikasi, watermark, stempel waktu, atau teks yang sama dengan caption." : "Tidak ada teks yang terbaca."} />
              {img.usedBy > 1 && <p className={m.sectionNote}>Gambar ini dipakai {formatNumber(img.usedBy)} post.</p>}
            </section>
          )))}
          {post.images.length > 1 && post.images.every((i) => !i.keyText && !i.ocrText) && (
            <section className={m.contextSection}><h3><IconFileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Teks di gambar</h3><p className={m.sectionNote}>Tidak ada teks yang terbaca di {post.images.length} gambar.</p></section>
          )}
          <SignalSections action={post.actionCall} claims={post.claims} narratives={post.narratives} onNarrative={onNarrative} />
          <AnalysisNote sensitive={post.sensitive} />
        </aside>
      </div>
    </div>
  );
}

/** Width of the two detail modals: wide enough for a tall screenshot beside its text. */
export const DETAIL_MODAL_SIZE = "min(1440px, calc(100vw - 24px))";

/** Top of the side column: the image's tags and signals at a glance (scores on hover). */
export function Summary({ tags, sensitive, action, claims, unread }: { tags: { tag: string; score: number }[]; sensitive: string[]; action: boolean; claims: number; unread: boolean }) {
  return (
    <section className={`${c.summary} ${c.tags}`} aria-label="Ringkasan analisis">
      {sensitive.length > 0 && <span data-tone="warn"><IconAlertTriangle size={12} />Perlu ditinjau</span>}
      {action && <span data-tone="alert">Ajakan aksi</span>}
      {claims > 0 && <span data-tone="info">{claims} klaim angka</span>}
      {unread && <span data-tone="info">Aksara lain</span>}
      {tags.filter((t) => !sensitive.includes(t.tag)).map((t) => <span key={t.tag} title={`Keyakinan ${Math.round(t.score * 100)}%`}>{tagLabel(t.tag)}</span>)}
      {!tags.length && !sensitive.length && !action && !claims && !unread && <em>Tidak ada tag yang cukup yakin</em>}
    </section>
  );
}

/** Bottom of the side column: what the sensitive flag means, and where the analysis ran. */
const LANGS: Record<string, string> = { id: "Indonesia", en: "Inggris", ms: "Melayu", jw: "Jawa", su: "Sunda", ar: "Arab", zh: "Mandarin" };

/** What is said in the video (Whisper, first minutes), with the detected language. */
export function Transcript({ text, lang, highlight = "" }: { text: string; lang: string | null; highlight?: string }) {
  return (
    <section className={m.contextSection}>
      <h3><IconMicrophone size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Ucapan di video{lang && <span className={c.transcriptLang}>{LANGS[lang] ?? lang}</span>}</h3>
      <p className={c.transcript}><Marked text={text} term={highlight} /></p>
      <p className={m.sectionNote}>Transkrip otomatis dari menit-menit pertama video; bisa keliru pada nama dan istilah.</p>
    </section>
  );
}

export function AnalysisNote({ sensitive }: { sensitive: string[] }) {
  return (
    <div className={c.analysisNote}>
      {sensitive.length > 0 && <p className={c.warn}>Ditandai otomatis sebagai kemungkinan konten sensitif ({sensitive.map(tagLabel).join(", ")}). Penanda ini belum tentu benar; periksa gambarnya.</p>}
      <p className={m.sectionNote}>Tag dan teks dibaca model lokal di server Signalbase, tanpa AI cloud. Gambarnya tidak disimpan.</p>
    </div>
  );
}

/** One line under a single image: its size and how widely it is used. */
export function MediaInfo({ img }: { img: { width: number | null; height: number | null; usedBy: number; twins: number } }) {
  const parts = [img.width && img.height ? `${img.width}×${img.height}` : null, img.usedBy > 1 ? `dipakai ${formatNumber(img.usedBy)} post` : null,
    img.twins > 0 ? `mirip ${formatNumber(img.twins)} gambar lain` : null].filter(Boolean);
  return parts.length ? <p className={c.mediaInfo}>{parts.join(" · ")}</p> : null;
}

const URL_RE = /https?:\/\/[^\s]+/g;
/** Post text: long posts folded to a few lines, links shortened to their host. */
function PostText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const mt of text.matchAll(URL_RE)) {
    parts.push(text.slice(at, mt.index));
    let host = mt[0];
    try { host = new URL(mt[0]).hostname.replace(/^www\./, ""); } catch { /* keep the raw text */ }
    parts.push(<a key={mt.index} href={mt[0]} target="_blank" rel="noreferrer noopener" className={c.postLink}>{host}…</a>);
    at = mt.index + mt[0].length;
  }
  parts.push(text.slice(at));
  return (
    <>
      <p className={c.postText} data-folded={(long && !open) || undefined}>{parts}</p>
      {long && <button type="button" className={c.moreText} onClick={() => setOpen((v) => !v)}>{open ? "Ringkas" : "Selengkapnya"}</button>}
    </>
  );
}
