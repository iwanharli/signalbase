"use client";
// /analisis/media — images of news, X and YouTube analysed by the local media worker: text in the image (OCR), visual
// tags, possibly sensitive content and re-shared pictures. Click an image for its details and the posts that use it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Skeleton, Tooltip } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconAlertTriangle, IconChartBar, IconMessages, IconSpeakerphone, IconChevronRight, IconCopy, IconEye, IconEyeOff, IconFileText, IconLanguage, IconLetterCase, IconPhoto, IconPhotoOff, IconPhotoScan, IconRefresh, IconSearch, IconStack2, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { formatNumber, sourceLabel } from "@/lib/media/labels";
import type { MediaItem, MediaType } from "@/lib/media/types";
import { NARRATIVE_MIN_POSTS, parseVisualDays, parseVisualView, tagLabel, VISUAL_KINDS, VISUAL_PERIODS, VISUAL_TAGS, WORKER_STALE_MS, type VisualAsset, type VisualFailures, type VisualPost, type VisualResponse, type VisualUse } from "@/lib/mediaVisual";
import { useApi } from "@/lib/useApi";
import controlClasses from "../ui/controls.module.css";
import { Segmented } from "../ui/controls";
import { ItemDetailModal } from "../media/ItemDetailModal";
import { Lightbox } from "../media/Lightbox";
import { VisualImage } from "./VisualImage";
import { Masonry } from "../media/Masonry";
import { OcrText } from "./OcrText";
import { Twins } from "./Twins";
import { NarrativeCard, SignalBadges, SignalSections } from "./Signals";
import { AnalysisNote, collageRatio, PostCard, PostModal, Summary, Transcript } from "./PostViews";
import { Button } from "../ui/Button";
import m from "../media/modal.module.css";
import { DetailDrawer } from "../media/DetailDrawer";
import classes from "../issues/issues.module.css";
import c from "./mediaVisual.module.css";

dayjs.extend(relativeTime);
const PERIOD_OPTIONS = VISUAL_PERIODS.map((p) => ({ value: String(p.days), label: p.label }));
const selectClasses = { input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption };
const VIEW_OPTIONS = [{ value: "post", label: "Per post" }, { value: "image", label: "Per gambar" }, { value: "narrative", label: "Narasi" }] as const;
/** Text in the image (default "Ada teks"): all, with key text, without (empty, or only app chrome/stamps/caption repeats). */
const TEXT_OPTIONS = [{ value: "all", label: "Semua" }, { value: "1", label: "Ada teks" }, { value: "0", label: "Tanpa teks" }];
const KIND_OPTIONS = [{ value: "", label: "Semua" }, ...Object.entries(VISUAL_KINDS).map(([value, label]) => ({ value, label }))];
const ago = (iso: string) => dayjs(iso).locale("id").fromNow();

export function MediaVisualBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keyId = params.get("key");
  const days = parseVisualDays(params.get("days"));
  const kind = params.get("kind") ?? "";
  const tag = params.get("tag") ?? "";
  const sensitive = params.get("sensitive") === "1";
  /** Text filter: "1" with text (default), "0" without, "all" every image. */
  const text = ["0", "all"].includes(params.get("text") ?? "") ? params.get("text")! : "1";
  const action = params.get("action") === "1";
  const claims = params.get("claims") === "1";
  const unread = params.get("unread") === "1";
  const narrative = params.get("narrative") ?? "";
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);
  /** Cursor of the page being loaded (null = first page); `next` from each response moves it on. */
  const [cursor, setCursor] = useState<string | null>(null);
  const view = parseVisualView(params.get("view"));
  const [items, setItems] = useState<VisualAsset[]>([]);
  const [posts, setPosts] = useState<VisualPost[]>([]);
  const [openPost, setOpenPost] = useState<VisualPost | null>(null);
  const [postZoom, setPostZoom] = useState<number | null>(null);
  const [open, setOpen] = useState<VisualAsset | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [post, setPost] = useState<{ item: MediaItem; type: MediaType } | null>(null);

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (!v) next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [params, pathname, router]);

  // Search applies after a short pause in typing.
  useEffect(() => { const t = setTimeout(() => { if (search.trim() !== q) go({ q: search.trim() || null }); }, 600); return () => clearTimeout(t); }, [search, q, go]);

  const filters = useMemo(() => {
    const s = new URLSearchParams({ days: String(days), view });
    for (const [k, v] of [["kind", kind], ["tag", tag], ["q", q], ["key", keyId ?? ""], ["narrative", narrative]] as const) if (v) s.set(k, v);
    if (action) s.set("action", "1");
    if (claims) s.set("claims", "1");
    if (unread) s.set("unread", "1");
    if (sensitive) s.set("sensitive", "1");
    if (text !== "all") s.set("text", text);
    return s.toString();
  }, [days, view, kind, tag, q, keyId, sensitive, text, action, claims, unread, narrative]);
  useEffect(() => { setCursor(null); setItems([]); setPosts([]); }, [filters]);

  const res = useApi<VisualResponse>(`/api/admin/media-visual?${filters}${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`);
  useEffect(() => {
    if (!res.data) return;
    setItems((prev) => (cursor === null ? res.data!.items : [...prev, ...res.data!.items.filter((i) => !prev.some((p) => p.id === i.id))]));
    setPosts((prev) => (cursor === null ? res.data!.posts : [...prev, ...res.data!.posts.filter((i) => !prev.some((p) => p.key === i.key))]));
  }, [res.data, cursor]);
  const narratives = res.data?.narratives ?? [];
  const count = view === "narrative" ? narratives.length : view === "post" ? posts.length : items.length;
  const stats = res.data?.stats;
  // Infinite scroll: the next page loads when the sentinel below the grid comes within ~600 px of the viewport.
  const sentinel = useRef<HTMLDivElement>(null);
  const next = res.data?.next ?? null;
  const canLoadMore = !!next && !res.loading;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canLoadMore) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setCursor(next); }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, next, count]);
  const worker = res.data?.worker;
  const workerStale = worker ? Date.now() - new Date(worker.heartbeatAt).getTime() > WORKER_STALE_MS : false;

  const heroStats = [
    { icon: IconPhoto, value: stats?.total, label: "gambar dianalisis" },
    { icon: IconLetterCase, value: stats?.withText, label: "berisi teks" },
    { icon: IconAlertTriangle, value: stats?.sensitive, label: "perlu ditinjau" },
  ];
  const tagOptions = [{ value: "", label: "Semua tag" }, ...Object.entries(VISUAL_TAGS).map(([value, label]) => {
    const n = stats?.tags.find((t) => t.tag === value)?.n;
    return { value, label: n ? `${label} (${formatNumber(n)})` : label };
  })];

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <IconPhotoScan className={classes.heroIcon} size={150} stroke={1} aria-hidden />
        <div className={classes.heroText}>
          <div className={c.heroTop}>
            <span className={classes.badge}><IconEye size={13} />Analisis lokal</span>
            {res.data && worker && <WorkerPill worker={worker} stale={workerStale} pending={stats?.pending ?? 0} />}
          </div>
          <h1>Media visual <em>{VISUAL_PERIODS.find((p) => p.days === days)?.label}</em> terakhir</h1>
          <p>Gambar dan video dari berita online, X, YouTube, Instagram, dan Threads: teks di dalam gambar, ucapan di video, tag visual, dan gambar yang beredar ulang. Dianalisis di server sendiri; gambar dan videonya tidak disimpan.</p>
        </div>
        <div className={classes.stats}>
          {heroStats.map((s) => <div key={s.label}><s.icon size={16} aria-hidden /><b>{s.value === undefined ? "—" : formatNumber(s.value)}</b><span>{s.label}</span></div>)}
          <FailedStat failed={stats?.failed} total={stats?.total} />
        </div>
      </header>

      {/* Two rows: search, period and view first; the filters below at one height, with a reset when any is set. */}
      <div className={`${classes.toolbar} ${c.toolbar}`}>
        <div className={c.toolbarRow}>
          <label className={`${classes.search} ${c.search}`}>
            <IconSearch size={15} />
            <input value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder="Cari teks penting di gambar  ( mis. korupsi, demo, ijazah )" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Hapus pencarian"><IconX size={14} /></button>}
          </label>
          <Segmented label="Periode" options={PERIOD_OPTIONS} value={String(days)} onChange={(v) => go({ days: v })} />
          <Segmented label="Tampilan" options={VIEW_OPTIONS} value={view} onChange={(v) => go({ view: v === "post" ? null : v })} />
        </div>
        <div className={c.toolbarRow} data-filters>
          <span className={c.filterLabel}><IconAdjustmentsHorizontal size={14} />Filter</span>
          <Select aria-label="Sumber gambar" w={170} allowDeselect={false} classNames={selectClasses} comboboxProps={{ withinPortal: true, zIndex: 400 }}
            value={kind} onChange={(v) => go({ kind: v || null })} data={KIND_OPTIONS.map((o) => ({ value: o.value, label: o.value ? o.label : "Semua sumber" }))} />
          <Select aria-label="Tag visual" w={210} allowDeselect={false} searchable classNames={selectClasses} comboboxProps={{ withinPortal: true, zIndex: 400 }}
            value={tag} onChange={(v) => go({ tag: v || null })} data={tagOptions} />
          <Segmented label="Teks di gambar" options={TEXT_OPTIONS} value={text} onChange={(v) => go({ text: v === "1" ? null : v })} />
          <div className={c.toggles}>
            <button type="button" data-active={sensitive || undefined} data-tone="warn" aria-pressed={sensitive} onClick={() => go({ sensitive: sensitive ? null : "1" })}><IconAlertTriangle size={14} />Perlu ditinjau</button>
            <button type="button" data-active={action || undefined} data-tone="alert" aria-pressed={action} onClick={() => go({ action: action ? null : "1" })}><IconSpeakerphone size={14} />Ajakan aksi</button>
            <button type="button" data-active={claims || undefined} aria-pressed={claims} onClick={() => go({ claims: claims ? null : "1" })}><IconChartBar size={14} />Klaim angka</button>
            <button type="button" data-active={unread || undefined} aria-pressed={unread} onClick={() => go({ unread: unread ? null : "1" })} title="Teks beraksara lain (Arab, Kirill, Mandarin…) yang belum bisa dibaca"><IconLanguage size={14} />Aksara lain</button>
          </div>
          {narrative && <span className={c.narrChip} title={narrative}><IconMessages size={13} />Pesan sama: “{narrative.split(" ").slice(0, 5).join(" ")}…”<button type="button" onClick={() => go({ narrative: null })} aria-label="Hapus filter narasi"><IconX size={12} /></button></span>}
          {(kind || tag || text !== "1" || sensitive || action || claims || unread || narrative || q || keyId) && (
            <button type="button" className={c.reset} onClick={() => { setSearch(""); go({ kind: null, tag: null, text: null, sensitive: null, action: null, claims: null, unread: null, narrative: null, q: null, key: null }); }}><IconRefresh size={13} />Reset</button>
          )}
        </div>
      </div>

      {res.error && <div className={classes.alert} role="alert"><IconAlertTriangle size={17} />{res.error}<Button size="sm" variant="secondary" onClick={() => void res.reload()}>Coba lagi</Button></div>}
      {stats?.syncing && <p className={c.note}>Gambar lama sedang dicocokkan dengan kata kunci proyek ini; hasilnya bertambah dalam beberapa menit.</p>}

      {/* Up to 4 columns; each card goes to the shortest column, sized by its photo (text block ≈ 0.55 of the width). */}
      {view === "narrative" && res.data && <p className={c.note}>Pesan yang sama di gambar setidaknya {NARRATIVE_MIN_POSTS} post dalam periode ini, termasuk gambar yang didesain ulang. Klik untuk melihat post-postnya.</p>}
      <Masonry minColumnWidth={260} heights={[
        ...(view === "narrative" ? narratives.map(() => 1 / 1.6 + 0.5) : view === "post" ? posts.map((p) => 1 / collageRatio(p) + 0.55) : items.map((a) => 1 / photoRatio(a) + 0.55)),
        ...(res.loading ? Array(cursor === null ? 12 : 4).fill(1.2) : [])]}>
        {[...(view === "narrative" ? narratives.map((n) => <NarrativeCard key={n.key} n={n} onOpen={() => go({ view: null, narrative: n.key })} />)
          : view === "post" ? posts.map((p) => <PostCard key={p.key} post={p} onOpen={() => setOpenPost(p)} />) : items.map((a) => <AssetCard key={a.id} asset={a} onOpen={() => setOpen(a)} />)),
          ...(res.loading ? Array.from({ length: cursor === null ? 12 : 4 }, (_, i) => <CardSkeleton key={`s${i}`} />) : [])]}
      </Masonry>
      {res.data && !count && !res.loading && (
        <div className={classes.empty}><IconPhotoScan size={26} /><b>Belum ada gambar yang cocok</b><span>Ubah filter atau periode, atau tunggu worker menganalisis gambar baru.</span></div>
      )}
      <div ref={sentinel} aria-hidden />
      {res.data && !res.data.hasMore && count > 0 && <p className={c.end}>Semua {formatNumber(count)} {view === "narrative" ? "narasi" : view === "post" ? "post" : "gambar"} sudah ditampilkan</p>}

      {/* One modal at a time: opening a post hides the image's modal, closing the post brings it back. */}
      <AssetModal asset={post ? null : open} highlight={q} onNarrative={(n) => { setOpen(null); go({ view: null, narrative: n }); }} onClose={() => setOpen(null)} onZoom={() => setZoom(0)} onPost={(u) => u.item && setPost({ item: u.item, type: u.type })} />
      <Lightbox images={open ? [{ src: open.url, alt: open.keyText.slice(0, 200) || undefined }] : []} index={zoom} onClose={() => setZoom(null)} />
      <PostModal post={post ? null : openPost} highlight={q} onNarrative={(n) => { setOpenPost(null); go({ view: null, narrative: n }); }} onClose={() => setOpenPost(null)} onZoom={setPostZoom}
        onOpenItem={() => openPost?.item && setPost({ item: openPost.item, type: openPost.type })} onOpenOther={(item, type) => setPost({ item, type })} />
      <Lightbox images={openPost ? openPost.images.map((i) => ({ src: i.url, alt: i.keyText.slice(0, 200) || undefined })) : []} index={postZoom} onClose={() => setPostZoom(null)} />
      <ItemDetailModal item={post?.item ?? null} type={post?.type ?? "social"} onClose={() => setPost(null)} />
    </div>
  );
}

/** Width/height of a card's photo, kept between 3:4 (portrait) and 2:1 so one extreme picture can't dominate a column. */
const photoRatio = (a: VisualAsset) => (a.width && a.height ? Math.min(2, Math.max(0.75, a.width / a.height)) : 16 / 10);

/** Worker health in the header (admins): dot, last heartbeat and the queue; the last error in the tooltip. */
function WorkerPill({ worker, stale, pending }: { worker: VisualResponse["worker"]; stale: boolean; pending: number }) {
  const state = !worker || stale ? "down" : !worker.serviceOk ? "warn" : "ok";
  const label = !worker ? "Worker belum berjalan" : stale ? `Worker berhenti · ${ago(worker.heartbeatAt)}` : !worker.serviceOk ? "Layanan analisis tidak menjawab" : `Worker aktif · ${ago(worker.heartbeatAt)}`;
  const tip = [worker?.lastTick ? `${formatNumber(worker.lastTick.analyzed)} gambar di putaran terakhir` : null, worker?.lastError ? `Galat terakhir: ${worker.lastError}` : null].filter(Boolean).join("\n");
  return (
    <span className={c.workerPill} data-state={state} role="status" title={tip || undefined}>
      <i />{label}{pending > 0 && <b>{formatNumber(pending)} antre</b>}
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className={c.card} data-skeleton>
      <Skeleton className={c.thumb} radius={0} />
      <span className={c.body}><Skeleton h={20} w="60%" radius={99} /><Skeleton h={12} /><Skeleton h={12} w="80%" /><Skeleton h={10} w="45%" mt="auto" /></span>
    </div>
  );
}

/** Fixed layout so every card has the same height: image (badges on it), tags (one line), text (two lines), footer. */
function AssetCard({ asset, onOpen }: { asset: VisualAsset; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const hidden = asset.sensitive.length > 0; // blurred in the grid; the detail opens it on request
  const source = asset.uses[0] ? sourceLabel(asset.uses[0].source) : VISUAL_KINDS[asset.kind];
  return (
    <button type="button" className={c.card} onClick={onOpen} data-sensitive={asset.sensitive.length > 0 || undefined}>
      <span className={c.thumb} style={{ aspectRatio: String(photoRatio(asset)) }}>
        {broken ? <span className={c.broken}><IconPhoto size={22} />Gambar sudah tidak tersedia</span>
          : <VisualImage src={asset.url} loading="lazy" onError={() => setBroken(true)} data-blur={hidden || undefined} />}
        {hidden && !broken && <span className={c.veil}><IconEyeOff size={18} />Kemungkinan konten sensitif<small>Klik untuk melihat</small></span>}
        <span className={c.badges}>
          <span className={c.kind}>{VISUAL_KINDS[asset.kind]}</span>
          {asset.sensitive.length > 0 && <span className={c.warnBadge} title="Ditandai otomatis; periksa sendiri sebelum menyimpulkan"><IconAlertTriangle size={11} />Perlu ditinjau</span>}
          <SignalBadges action={asset.actionCall} claims={asset.claims.length} unread={asset.unreadText && !asset.keyText} speech={!!asset.transcript} />
        </span>
        {asset.twins > 0 && <span className={c.twins} title="Gambar yang sama ditemukan di URL lain"><IconCopy size={11} />{asset.twins + 1}×</span>}
      </span>
      <span className={c.body}>
        <span className={c.tagLine}>
          {asset.tags.length ? asset.tags.filter((t) => !asset.sensitive.includes(t.tag)).slice(0, 3).map((t) => <span key={t.tag}>{tagLabel(t.tag)}</span>) : <em>Tanpa tag</em>}
        </span>
        <span className={c.ocr} data-empty={!asset.keyText || undefined}>
          {asset.keyText ? <><IconFileText size={12} />{asset.keyText.replace(/\s+/g, " ")}</> : "Tidak ada teks penting di gambar"}
        </span>
        <span className={c.foot}>
          <span className={c.footSource}>{source}</span>
          <span>{asset.usedBy > 1 ? `${formatNumber(asset.usedBy)} post · ` : ""}{ago(asset.lastSeen)}</span>
        </span>
      </span>
    </button>
  );
}

/** Same look as the post detail modal (media/modal.module.css): dark header, image and text on the left, tags and uses on the right. */
function AssetModal({ asset, onClose, onZoom, onPost, onNarrative, highlight }: { asset: VisualAsset | null; onClose: () => void; onZoom: () => void; onPost: (u: VisualUse) => void; onNarrative: (key: string) => void; highlight?: string }) {
  const [last, setLast] = useState<VisualAsset | null>(asset);
  useEffect(() => { if (asset) setLast(asset); }, [asset]);
  const a = asset ?? last;
  const tone = a?.sensitive.length ? "var(--mantine-color-orange-6)" : "var(--mantine-color-violet-6)";
  return (
    <DetailDrawer opened={!!asset} onClose={onClose} label="Detail gambar" tone={tone}>
      {a && <AssetDetail key={a.id} asset={a} onClose={onClose} onZoom={onZoom} onPost={onPost} onNarrative={onNarrative} highlight={highlight} />}
    </DetailDrawer>
  );
}

function AssetDetail({ asset, onClose, onZoom, onPost, onNarrative, highlight }: { asset: VisualAsset; onClose: () => void; onZoom: () => void; onPost: (u: VisualUse) => void; onNarrative: (key: string) => void; highlight?: string }) {
  const [broken, setBroken] = useState(false);
  const [shown, setShown] = useState(asset.sensitive.length === 0);
  const source = asset.uses[0] ? sourceLabel(asset.uses[0].source) : VISUAL_KINDS[asset.kind];
  return (
    <div className={`${m.shell} ${c.detailShell}`}>
      <header className={m.header}>
        <span className={m.avatar} aria-hidden><IconPhotoScan size={20} /></span>
        <div className={m.heading}>
          <h2 className={m.title}>{VISUAL_KINDS[asset.kind]}<span className={c.headSource}>{source}</span></h2>
          <p className={m.subtitle}>
            <span>{ago(asset.lastSeen)}</span>
            <span>dipakai {formatNumber(asset.usedBy)} post</span>
            {asset.width && asset.height ? <span>{asset.width}×{asset.height}</span> : null}
            {asset.twins > 0 && <span>mirip {asset.twins} gambar lain</span>}
          </p>
        </div>
        <div className={m.headerActions}>
          <button type="button" data-autofocus className={m.close} onClick={onClose} aria-label="Tutup detail"><IconX size={18} aria-hidden /></button>
        </div>
      </header>

      <div className={`${m.columns} ${c.detailColumns}`}>
        <section className={m.mainCol} aria-label="Gambar">
          {broken ? <div className={c.detailBroken}><IconPhoto size={26} />Gambar sudah tidak tersedia di sumbernya</div> : (
            <button type="button" className={`${m.media} ${c.detailMedia}`} onClick={() => (shown ? onZoom() : setShown(true))} aria-label={shown ? "Perbesar gambar" : "Tampilkan gambar sensitif"}>
              <VisualImage src={asset.url} onError={() => setBroken(true)} data-blur={!shown || undefined} />
              {!shown && <span className={c.veil}><IconEyeOff size={22} />Kemungkinan konten sensitif<small>Klik untuk menampilkan gambar</small></span>}
            </button>
          )}
          <Twins assetId={asset.id} count={asset.twins} onPost={(item, type) => onPost({ type, code: item.code, source: item.source, publishedAt: item.publishedAt, item })} />
        </section>

        <aside className={m.sideCol} aria-label="Teks dan analisis gambar">
          <Summary tags={asset.tags} sensitive={asset.sensitive} action={!!asset.actionCall} claims={asset.claims.length} unread={asset.unreadText && !asset.keyText} />
          <section className={m.contextSection}>
            <h3><IconFileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Teks penting di gambar</h3>
            <OcrText keyText={asset.keyText} ocrText={asset.ocrText} ocrWords={asset.ocrWords} highlight={highlight}
              emptyNote={asset.unreadText ? "Ada teks beraksara lain (mis. Arab, Kirill, Mandarin) yang belum bisa dibaca; periksa gambarnya." : asset.ocrText ? "Hanya teks tampilan aplikasi, watermark, stempel waktu, atau teks yang sama dengan caption." : "Tidak ada teks yang terbaca."} />
          </section>
          {asset.transcript && <Transcript text={asset.transcript} lang={asset.transcriptLang} highlight={highlight} />}
          <SignalSections action={asset.actionCall} claims={asset.claims} narratives={asset.narrative ? [asset.narrative] : []} onNarrative={onNarrative} />

          <section className={m.contextSection}>
            <h3><IconStack2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Dipakai di {formatNumber(asset.usedBy)} post</h3>
            <ul className={c.uses}>
              {asset.uses.map((u) => (
                <li key={`${u.type}:${u.code}`}>
                  <button type="button" onClick={() => onPost(u)} disabled={!u.item}>
                    <span className={c.useText}>
                      <b>{sourceLabel(u.source)}<small>{ago(u.publishedAt)}</small></b>
                      <span>{u.item ? (u.item.title ?? u.item.content ?? "").slice(0, 180) : "Item tidak ditemukan di bank data"}</span>
                    </span>
                    {u.item && <IconChevronRight size={16} className={c.useArrow} />}
                  </button>
                </li>
              ))}
            </ul>
            {asset.usedBy > asset.uses.length && <p className={m.sectionNote}>Menampilkan {asset.uses.length} post terbaru.</p>}
          </section>
          <AnalysisNote sensitive={asset.sensitive} />
        </aside>
      </div>
    </div>
  );
}

/** Hero card: images of the period that couldn't be read, with the causes on hover. */
function FailedStat({ failed, total }: { failed?: VisualFailures; total?: number }) {
  const share = failed && total !== undefined && failed.total + total > 0 ? Math.round((failed.total / (failed.total + total)) * 1000) / 10 : null;
  const rows = failed ? [
    { label: "Dihapus situsnya (404/410)", n: failed.removed },
    { label: "Ditolak situs (403, tidak diakali)", n: failed.refused },
    { label: `Timeout / koneksi${failed.retrying ? ` (${formatNumber(failed.retrying)} masih dicoba ulang)` : ""}`, n: failed.timeout },
    { label: "Lainnya (bukan gambar, terlalu besar)", n: failed.other },
  ].filter((r) => r.n > 0) : [];
  return (
    <Tooltip withArrow multiline w={300} position="bottom" disabled={!rows.length} label={
      <div className={c.failTip}>
        <b>Gambar yang tidak bisa dibaca{share !== null ? ` · ${share.toLocaleString("id-ID")}%` : ""}</b>
        {rows.map((r) => <span key={r.label}><em>{r.label}</em>{formatNumber(r.n)}</span>)}
      </div>
    }>
      <div tabIndex={rows.length ? 0 : undefined}><IconPhotoOff size={16} aria-hidden /><b>{failed ? formatNumber(failed.total) : "—"}</b><span>tidak terbaca</span></div>
    </Tooltip>
  );
}
