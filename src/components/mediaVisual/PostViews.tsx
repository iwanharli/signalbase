"use client";
// Media visual, per post: a card shows a post's images as a collage (1 full, 2 side by side, 3 one big + two, 4 as 2×2)
// with their text and tags merged; the modal shows every image with its own text and tags. Images that match the
// filters come first (the server sorts them).
import { useEffect, useState } from "react";
import { Modal } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { IconAlertTriangle, IconCopy, IconExternalLink, IconEyeOff, IconFileText, IconPhoto, IconPhotoScan, IconStack2, IconTags, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { formatNumber, sourceLabel } from "@/lib/media/labels";
import { tagLabel, VISUAL_KINDS, type VisualPost } from "@/lib/mediaVisual";
import m from "../media/modal.module.css";
import c from "./mediaVisual.module.css";
import { OcrText } from "./OcrText";
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
  const videos = p.images.filter((i) => i.kind === "x_video" || i.kind === "youtube").length;
  const photos = p.images.length - videos;
  return [videos && `${videos} video`, photos && `${photos} foto`].filter(Boolean).join(" + ");
}

function Tile({ img, blur, more }: { img: Img; blur: boolean; more?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={c.tile}>
      {broken ? <span className={c.broken}><IconPhoto size={18} /></span>
        // eslint-disable-next-line @next/next/no-img-element -- remote media from many hosts
        : <img src={img.url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} data-blur={blur || undefined} />}
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
          <SignalBadges action={post.actionCall} claims={post.claims.length} unread={post.unreadText && !post.keyText} />
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
    <Modal.Root opened={!!post} onClose={onClose} size={1100} radius={20} padding={0} centered yOffset={16} xOffset={12}
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
    <div className={m.shell}>
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

      <div className={m.columns}>
        <section className={m.mainCol} aria-label="Gambar">
          <div className={c.gallery} data-n={Math.min(4, post.images.length)}>
            {post.images.map((img, i) => (
              <button key={img.id} type="button" className={c.galleryItem} onClick={() => (revealed ? onZoom(i) : setRevealed(true))} aria-label={revealed ? `Perbesar gambar ${i + 1}` : "Tampilkan gambar sensitif"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" referrerPolicy="no-referrer" data-blur={(!revealed && img.sensitive.length > 0) || undefined} />
                {post.images.length > 1 && <span className={c.galleryNo}>{i + 1}</span>}
                {!revealed && img.sensitive.length > 0 && <span className={c.veil}><IconEyeOff size={20} />Kemungkinan konten sensitif<small>Klik untuk menampilkan</small></span>}
              </button>
            ))}
          </div>

          {post.images.map((img, i) => (
            <Twins key={img.id} assetId={img.id} count={img.twins} label={post.images.length > 1 ? `Gambar ${i + 1}` : undefined} onPost={onOpenOther} />
          ))}
        </section>

        <aside className={m.sideCol} aria-label="Post dan analisis">
          <section className={m.contextSection}>
            <h3>{post.type === "social" ? "Post" : "Berita"}</h3>
            {post.item ? (
              <>
                <p className={c.postText}>{text.slice(0, 500)}{text.length > 500 ? "…" : ""}</p>
                <button type="button" className={c.openPost} onClick={onOpenItem}><IconExternalLink size={14} />Buka detail {post.type === "social" ? "post" : "berita"}</button>
              </>
            ) : <p className={m.sectionNote}>Item tidak ditemukan di bank data.</p>}
          </section>
          {post.images.map((img, i) => (
            <section key={img.id} className={m.contextSection}>
              <h3><IconFileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{post.images.length > 1 ? `Teks di gambar ${i + 1}` : "Teks penting di gambar"}</h3>
              {img.tags.length > 0 && <div className={c.tags}>{img.sensitive.length > 0 && <span data-tone="warn"><IconAlertTriangle size={11} />Perlu ditinjau</span>}{img.tags.map((t) => <span key={t.tag} title={`Keyakinan ${Math.round(t.score * 100)}%`}>{tagLabel(t.tag)}</span>)}</div>}
              <OcrText keyText={img.keyText} ocrText={img.ocrText} ocrWords={img.ocrWords} highlight={highlight}
                emptyNote={img.unreadText ? "Ada teks beraksara lain (mis. Arab, Kirill, Mandarin) yang belum bisa dibaca; periksa gambarnya." : img.ocrText ? "Hanya teks tampilan aplikasi, watermark, stempel waktu, atau teks yang sama dengan caption." : "Tidak ada teks yang terbaca."} />
              {img.usedBy > 1 && <p className={m.sectionNote}>Gambar ini dipakai {formatNumber(img.usedBy)} post.</p>}
            </section>
          ))}
          <SignalSections action={post.actionCall} claims={post.claims} narratives={post.narratives} onNarrative={onNarrative} />
          <section className={m.analysis}>
            <div className={m.sectionHead}><IconTags size={15} /><h3>Tag visual gabungan</h3></div>
            {post.tags.length ? <div className={c.tags}>{post.tags.map((t) => <span key={t.tag} data-tone={post.sensitive.includes(t.tag) ? "warn" : undefined}>{tagLabel(t.tag)}</span>)}</div>
              : <p className={m.sectionNote}>Tidak ada tag yang cukup yakin.</p>}
            {post.sensitive.length > 0 && <p className={c.warn}>Ditandai otomatis sebagai kemungkinan konten sensitif ({post.sensitive.map(tagLabel).join(", ")}). Penanda ini belum tentu benar; periksa gambarnya.</p>}
            <p className={m.sectionNote}>Tag dan teks dibaca model lokal di server Signalbase, tanpa AI cloud. Gambarnya tidak disimpan.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
