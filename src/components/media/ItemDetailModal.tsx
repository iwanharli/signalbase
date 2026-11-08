"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CopyButton, Modal, Select, Tabs, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { post } from "@/lib/api-client";
import { NO_CATEGORY, type Category } from "@/lib/ai/classifier";
import { useReducedMotion } from "@mantine/hooks";
import { IconCheck, IconClock, IconCopy, IconDatabase, IconInfoCircle, IconMessage, IconRobot, IconSparkles, IconX } from "@tabler/icons-react";
import { humanize, RELEVANCE_LABEL, sourceLabel } from "@/lib/media/labels";
import { metaPost } from "@/lib/media/metaPost";
import { threadsPost } from "@/lib/media/threadsPost";
import { publicVideo } from "@/lib/media/publicVideo";
import { xPostId } from "@/lib/media/xPost";
import { formatWibDate, languageLabel, uniqueTags } from "@/lib/media/presentation";
import type { Analysis, ItemClassification, MediaItem, MediaType } from "@/lib/media/types";
import { AiCategoryBadge, FactorGrid, MoodBadges, moodTone, numericFactors, ScoreMeter, Tags, TargetTag } from "./itemParts";
import { Button } from "../ui/Button";
import { PostContent } from "./PostContent";
import { PlatformIcon } from "./PlatformIcon";
import { PostTypeBadge } from "./PostTypeBadge";
import { SourceLink } from "./SourceLink";
import classes from "./modal.module.css";

const OriginalXPost = dynamic(() => import("./OriginalXPost").then((module) => module.OriginalXPost));

const OriginalPublicVideo = dynamic(() => import("./OriginalPublicVideo").then((module) => module.OriginalPublicVideo));

const OriginalThreadsPost = dynamic(() => import("./OriginalThreadsPost").then((module) => module.OriginalThreadsPost));

const OriginalMetaPost = dynamic(() => import("./OriginalMetaPost").then((module) => module.OriginalMetaPost));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={classes.row}><dt>{label}</dt><dd>{children}</dd></div>;
}

function AnalysisSection({ analysis, type }: { analysis: Analysis; type: MediaType }) {
  const factors = numericFactors(analysis.factors);
  const signals = uniqueTags(analysis.signals);
  const topics = uniqueTags(analysis.topics);
  const hasDetails = analysis.target || analysis.relevance || analysis.score != null || signals.length || topics.length;
  const hasContent = analysis.summary || hasDetails || factors.length;
  if (!hasContent && type !== "social") return null;

  return (
    <section className={classes.analysis} aria-label="Analisis sumber">
      <div className={classes.sectionHead}><IconSparkles size={16} aria-hidden /><h3>Analisis sumber</h3></div>
      {!hasContent && <p className={classes.sectionNote}>Belum ada rincian hasil analisis yang tersedia.</p>}
      {analysis.summary && <div className={classes.summaryBlock}><h4>Ringkasan AI</h4><p className={classes.summary}>{analysis.summary}</p></div>}
      {!!hasDetails && <dl className={classes.rows}>
        {analysis.target && <Row label="Target"><TargetTag target={analysis.target} /></Row>}
        {analysis.relevance && <Row label="Relevansi">{RELEVANCE_LABEL[analysis.relevance]}</Row>}
        {analysis.score != null && <Row label="Skor emosi"><div className={classes.scoreDetail}><ScoreMeter score={analysis.score} /><span className={classes.fieldNote}>Acuan visual sekitar −3 hingga +3: negatif → positif. Berbeda dari intensitas emosi 1–5.</span></div></Row>}
        {signals.length > 0 && <Row label="Sinyal"><Tags values={signals} /></Row>}
        {topics.length > 0 && <Row label="Topik"><Tags values={topics} /></Row>}
      </dl>}
      {factors.length > 0 && <div className={classes.factorSection}><h4>Faktor analisis</h4><FactorGrid factors={factors} /></div>}
    </section>
  );
}

function ContextSection({ item, type, keyName }: { item: MediaItem; type: MediaType; keyName?: string }) {
  const metadata = item.socialMetadata;
  if (type !== "social" && !item.category && !item.province && !item.location) return null;
  return (
    <section className={classes.contextSection} aria-label={type === "social" ? "Konteks post" : "Konteks berita"}>
      <h3>{type === "social" ? "Konteks post" : "Konteks berita"}</h3>
      <dl className={classes.rows}>
        {item.category && <Row label="Kategori"><span className={classes.category}>{humanize(item.category)}</span></Row>}
        {type === "social" && <Row label="Bahasa">{languageLabel(metadata?.language)}</Row>}
        {item.province && <Row label="Provinsi">{item.province}</Row>}
        {item.location && item.location !== item.province && <Row label="Lokasi disebut">{item.location}</Row>}
        {type === "social" && keyName && metadata && !metadata.keywordRestricted && <Row label="Kata kunci"><span className={classes.fieldNote}>Kunci ini tidak membatasi kata kunci.</span></Row>}
        {type === "social" && metadata?.keywordRestricted && <Row label="Kata kunci cocok">
          {metadata.matchedKeywords.length
            ? <div className={classes.keywordMatches}>{metadata.matchedKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
            : <span className={classes.fieldNote}>Tidak ditemukan kecocokan pada indeks post saat ini.</span>}
        </Row>}
      </dl>
    </section>
  );
}

function KeyAnalysis({ item, keyName, type, correction }: { item: MediaItem; keyName?: string; type: MediaType; correction?: Correction }) {
  const result = item.classification;
  if (result === undefined) return null;
  // null: the key categorises, but the worker has not reached this item yet.
  if (result === null) {
    return (
      <section className={`${classes.analysis} ${classes.keyAnalysis}`} aria-label="Kategorisasi AI kunci">
        <div className={classes.sectionHead}><IconRobot size={16} aria-hidden /><h3>Kategorisasi AI kunci</h3></div>
        <p className={classes.sectionNote}>Belum dikategorikan. Item ini akan diberi kategori saat worker {keyName ? `kunci “${keyName}”` : "kunci ini"} sampai ke tanggal terbitnya.</p>
        {correction && <CorrectionField item={item} type={type} correction={correction} />}
      </section>
    );
  }
  const confidence = result.confidence;
  return (
    <section className={`${classes.analysis} ${classes.keyAnalysis}`} aria-label="Kategorisasi AI kunci">
      <div className={classes.sectionHead}><IconRobot size={16} aria-hidden /><h3>Kategorisasi AI kunci</h3></div>
      <p className={classes.sectionNote}>Kategori khusus untuk {keyName ? `kunci “${keyName}”` : "kunci API ini"}, terpisah dari analisis sumber.</p>
      <AiCategoryBadge item={item} />
      {result.reason && <div className={classes.summaryBlock}><h4>Alasan kategorisasi</h4><p className={classes.classificationReason}>{result.reason}</p></div>}
      <dl className={classes.rows}>
        <Row label="Keyakinan model"><Tooltip label="Estimasi keyakinan dari model, bukan ukuran akurasi yang telah diverifikasi." multiline maw={280} withArrow events={{ hover: true, focus: true, touch: true }}><span className={classes.confidence} tabIndex={0}>{confidence != null && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? `${Math.round(confidence * 100)}%` : "Tidak tersedia"}</span></Tooltip></Row>
        {(type === "social" || result.categorizedAt) && <Row label="Dikategorikan">{formatWibDate(result.categorizedAt)}</Row>}
        {result.manual && <Row label="Koreksi">Manual{result.correctedBy ? ` oleh ${result.correctedBy}` : ""}</Row>}
      </dl>
      {correction && <CorrectionField item={item} type={type} correction={correction} />}
    </section>
  );
}

export type Correction = { keyId: string; categories: Category[]; onSaved: (code: string, classification: ItemClassification) => void };

/** Set the key's category for this item by hand; the worker keeps manual labels. */
function CorrectionField({ item, type, correction }: { item: MediaItem; type: MediaType; correction: Correction }) {
  const current = item.classification?.category ?? null;
  const [value, setValue] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const options = [...correction.categories.map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` })), { value: NO_CATEGORY, label: "Tidak termasuk" }];
  const save = async () => {
    if (!value) return;
    setBusy(true);
    try {
      const res = await post(`/api/admin/keys/${correction.keyId}/classifications`, { type, code: item.code, category: value }, "PUT") as { category: string; correctedBy: string; reason: string | null };
      const label = value === NO_CATEGORY ? "Tidak termasuk" : correction.categories.find((c) => c.code === value)?.label ?? value;
      correction.onSaved(item.code, { ...(item.classification ?? {}), category: res.category, label, confidence: null, reason: res.reason, manual: true, correctedBy: res.correctedBy });
      notifications.show({ color: "teal", message: value === current ? "Kategori dikonfirmasi" : `Kategori diubah ke ${value === NO_CATEGORY ? "Tidak termasuk" : value}` });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={classes.correction}>
      <Select size="sm" radius="md" value={value} onChange={setValue} data={options} placeholder="Pilih kategori yang benar" aria-label="Koreksi kategori" comboboxProps={{ withinPortal: true, zIndex: 500 }} className={classes.correctionSelect} />
      <Button size="sm" variant="primary" onClick={save} loading={busy} disabled={!value || (value === current && !!item.classification?.manual)}>
        {value === current && current ? "Konfirmasi" : "Simpan koreksi"}
      </Button>
    </div>
  );
}

/** Keyed by item so opening another post starts at the top with fresh image state. */
function DetailContent({ item, type, keyName, onClose, correction }: { item: MediaItem; type: MediaType; keyName?: string; onClose: () => void; correction?: Correction }) {
  const [hasImage, setHasImage] = useState(true);
  const originalId = type === "social" ? xPostId(item.socialMetadata?.sourceUrl) : null;
  const video = type === "social" ? publicVideo(item.socialMetadata?.sourceUrl) : null;
  const thread = type === "social" ? threadsPost(item.socialMetadata?.sourceUrl) : null;
  const meta = type === "social" ? metaPost(item.socialMetadata?.sourceUrl) : null;
  const storedContent = <PostContent text={item.content} title={item.title} metrics={item.metrics} />;
  return (
    <div className={classes.scroll}>
      <header className={classes.header}>
        <div className={classes.heading}>
          <h2 className={classes.source}>{type === "social" && <PlatformIcon source={item.source} onDark />}{sourceLabel(item.source)}{item.postType && <PostTypeBadge value={item.postType} onDark />}</h2>
          {(item.author?.name || item.author?.username) && <p className={classes.author}>
            {item.author.profileUrl ? <a href={item.author.profileUrl} target="_blank" rel="noopener noreferrer nofollow">{item.author.name || `@${item.author.username}`}</a> : <b>{item.author.name || `@${item.author.username}`}</b>}
            {item.author.name && item.author.username && <span>@{item.author.username.replace(/^@/, "")}</span>}
            {item.author.followers != null && <span>{item.author.followers.toLocaleString("id-ID")} pengikut</span>}
          </p>}
          <div className={classes.headerMeta}>
            <time className={classes.time} dateTime={item.publishedAt}><IconClock size={13} aria-hidden /><span>{formatWibDate(item.publishedAt)}</span></time>
            <MoodBadges item={item} type={type} onDark />
          </div>
        </div>
        <div className={classes.headerActions}>
          <SourceLink item={item} type={type} onDark />
          <button type="button" data-autofocus className={classes.close} onClick={onClose} aria-label="Tutup detail"><IconX size={18} aria-hidden /></button>
        </div>
      </header>
      <Tabs defaultValue="post" keepMounted={false} className={classes.detailTabs}>
        <Tabs.List grow className={classes.detailTabList} aria-label="Bagian detail media">
          <Tabs.Tab value="post" className={classes.detailTab} leftSection={<IconMessage size={15} aria-hidden />}>{type === "social" ? "Postingan" : "Berita"}</Tabs.Tab>
          <Tabs.Tab value="analysis" className={classes.detailTab} leftSection={<IconSparkles size={15} aria-hidden />}>Analisis</Tabs.Tab>
          <Tabs.Tab value="info" className={classes.detailTab} leftSection={<IconInfoCircle size={15} aria-hidden />}>Informasi</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="post" className={`${classes.body} ${classes.tabPanel}`} tabIndex={0}>
      {item.image && hasImage && <div className={classes.media}>
        {/* eslint-disable-next-line @next/next/no-img-element -- source-hosted artwork */}
        <img src={item.image} alt="" referrerPolicy="no-referrer" onError={() => setHasImage(false)} />
      </div>}
        <section className={classes.postSection} aria-label={type === "social" ? "Isi post" : "Cuplikan berita"}>
          {originalId ? <OriginalXPost key={originalId} id={originalId} fallback={storedContent} /> : video ? <OriginalPublicVideo key={video.url} video={video} storedText={item.content} fallback={storedContent} /> : thread ? <OriginalThreadsPost key={thread.id} post={thread} fallback={storedContent} /> : meta ? <OriginalMetaPost key={meta.url} post={meta} fallback={storedContent} /> : <>
            {type === "social" && <span className={classes.contentSource}><IconDatabase size={12} aria-hidden />Data tersimpan</span>}
            {storedContent}
          </>}
        </section>
        </Tabs.Panel>
        <Tabs.Panel value="analysis" className={`${classes.body} ${classes.tabPanel}`} tabIndex={0}>
        {!item.analysis && !item.classification && <p className={classes.sectionNote}>Belum ada rincian analisis yang tersedia.</p>}
        {item.analysis && <AnalysisSection analysis={item.analysis} type={type} />}
        <KeyAnalysis item={item} type={type} keyName={keyName} correction={correction} />
        </Tabs.Panel>
        <Tabs.Panel value="info" className={`${classes.body} ${classes.tabPanel}`} tabIndex={0}>
        <KeyAnalysis item={item} type={type} keyName={keyName} correction={correction} />
        <ContextSection item={item} type={type} keyName={keyName} />
        {type !== "social" && !item.category && !item.province && !item.location && <p className={classes.sectionNote}>Belum ada informasi tambahan yang tersedia.</p>}
        {type === "social" && <section className={classes.technical} aria-label="Informasi teknis">
          <h3>Informasi teknis</h3>
          <dl className={classes.rows}><Row label="Kode post"><div className={classes.codeRow}><code>{item.code}</code>
            <CopyButton value={item.code}>{({ copied, copy }) => <Button size="sm" variant="subtle" icon={copied ? IconCheck : IconCopy} onClick={copy}>{copied ? "Tersalin" : "Salin"}</Button>}</CopyButton>
          </div></Row></dl>
        </section>}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

export function ItemDetailModal({ item, type, onClose, keyName, correction }: { item: MediaItem | null; type: MediaType; onClose: () => void; keyName?: string; correction?: Correction }) {
  const [lastItem, setLastItem] = useState<MediaItem | null>(item);
  const reducedMotion = useReducedMotion();
  useEffect(() => { if (item) setLastItem(item); }, [item]);
  const shown = item ?? lastItem;
  const label = shown ? `Detail ${type === "social" ? "post" : "berita"} ${sourceLabel(shown.source)}: ${(shown.title || shown.content || shown.code).slice(0, 100)}` : "Detail media";
  return (
    <Modal.Root opened={!!item} onClose={onClose} size={700} radius={18} padding={0} centered yOffset={16} xOffset={12}
      transitionProps={{ transition: "fade", duration: reducedMotion ? 0 : 160 }}>
      <Modal.Overlay backgroundOpacity={0.48} blur={3} />
      <Modal.Content className={classes.content} aria-label={label} style={{ ["--tone" as string]: shown ? moodTone(shown) : undefined }}>
        <Modal.Body>{shown && <DetailContent key={`${type}:${shown.code}`} item={shown} type={type} keyName={keyName} onClose={onClose} correction={correction} />}</Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
