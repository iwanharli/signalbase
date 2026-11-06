"use client";
import { useEffect, useState } from "react";
import { Badge, Modal, ScrollArea } from "@mantine/core";
import { IconClock, IconExternalLink, IconSparkles, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { humanize, MOOD_KIND_LABEL, POST_TYPE_LABEL, RELEVANCE_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodInfo } from "@/lib/media/mood";
import type { Analysis, MediaItem, MediaType } from "@/lib/media/types";
import { DashboardTags, FactorGrid, MetricList, MoodBadges, moodTone, numericFactors, ScoreMeter, Tags, TargetTag } from "./itemParts";
import classes from "./modal.module.css";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={classes.row}><span className={classes.rowLabel}>{label}</span><div>{children}</div></div>;
}

function AnalysisSection({ item, analysis, type }: { item: MediaItem; analysis: Analysis; type: MediaType }) {
  const mood = item.mood ? moodInfo(item.mood) : null;
  const factors = numericFactors(analysis.factors);
  const tags = [...analysis.signals, ...analysis.topics];
  const hasContent = analysis.summary || analysis.target || tags.length || analysis.score != null || factors.length || analysis.dashboards.length;
  if (!hasContent) return null;

  return (
    <section className={classes.analysis}>
      <h3><IconSparkles size={15} />Analisis AI</h3>
      {analysis.summary && <p className={classes.summary}>{analysis.summary}</p>}
      <div className={classes.rows}>
        {mood && (
          <Row label={MOOD_KIND_LABEL[type]}>
            <Badge variant="light" color={mood.color}>{mood.label}{item.moodLevel ? ` · intensitas ${item.moodLevel}/5` : ""}</Badge>
          </Row>
        )}
        {analysis.target && <Row label="Target"><TargetTag target={analysis.target} /></Row>}
        {analysis.relevance && <Row label="Relevansi">{RELEVANCE_LABEL[analysis.relevance]}</Row>}
        {analysis.score != null && <Row label="Skor emosi"><ScoreMeter score={analysis.score} /></Row>}
        {tags.length > 0 && <Row label={analysis.topics.length ? "Topik & sinyal" : "Sinyal"}><Tags values={tags} /></Row>}
        {analysis.dashboards.length > 0 && <Row label="Dashboard"><DashboardTags values={analysis.dashboards} /></Row>}
      </div>
      {factors.length > 0 && <FactorGrid factors={factors} />}
    </section>
  );
}

/** Full item: complete text, all metadata and the whole AI analysis. */
export function ItemDetailModal({ item, type, onClose }: { item: MediaItem | null; type: MediaType; onClose: () => void }) {
  // Keep showing the last item while the close animation runs.
  const [shown, setShown] = useState<MediaItem | null>(item);
  const [hasImage, setHasImage] = useState(true);
  useEffect(() => {
    if (!item) return;
    setShown(item);
    setHasImage(true);
  }, [item]);

  return (
    <Modal
      opened={!!item}
      onClose={onClose}
      size="lg"
      radius={22}
      padding={0}
      centered
      withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.55, blur: 6 }}
      transitionProps={{ transition: "pop", duration: 260, timingFunction: "cubic-bezier(.22,1,.36,1)" }}
      classNames={{ content: classes.content }}
      scrollAreaComponent={ScrollArea.Autosize}
    >
      {shown && (
        <div style={{ ["--tone" as string]: moodTone(shown) }}>
          <header className={classes.header}>
            <div className={classes.heading}>
              <span className={classes.source}>
                {sourceLabel(shown.source)}
                {shown.postType && <em>{POST_TYPE_LABEL[shown.postType] ?? shown.postType}</em>}
              </span>
              <span className={classes.time}><IconClock size={13} />{dayjs(shown.publishedAt).locale("id").format("dddd, D MMMM YYYY · HH:mm")}</span>
            </div>
            <button type="button" className={classes.close} onClick={onClose} aria-label="Tutup"><IconX size={18} /></button>
          </header>

          {shown.image && hasImage && (
            <div className={classes.media}>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote images from many news hosts */}
              <img src={shown.image} alt="" referrerPolicy="no-referrer" onError={() => setHasImage(false)} />
            </div>
          )}

          <div className={classes.body}>
            <MoodBadges item={shown} />
            {shown.title && <h2 className={classes.title}>{shown.title}</h2>}
            {shown.content && <p className={classes.text}>{shown.content}</p>}
            <div className={classes.metrics}><MetricList metrics={shown.metrics} /></div>

            {shown.analysis && <AnalysisSection item={shown} analysis={shown.analysis} type={type} />}

            <div className={classes.rows}>
              {shown.category && <Row label="Kategori"><span style={{ textTransform: "capitalize" }}>{humanize(shown.category)}</span></Row>}
              {shown.province && <Row label="Provinsi">{shown.province}</Row>}
              {shown.location && <Row label="Lokasi">{shown.location}</Row>}
            </div>
          </div>

          {shown.url && (
            <footer className={classes.footer}>
              <a href={shown.url} target="_blank" rel="noopener noreferrer nofollow" className={classes.sourceLink}>Baca di sumber <IconExternalLink size={15} /></a>
            </footer>
          )}
        </div>
      )}
    </Modal>
  );
}
