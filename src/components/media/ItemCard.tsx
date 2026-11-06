"use client";
import { useState } from "react";
import { Group, Text } from "@mantine/core";
import { IconArrowRight, IconClock, IconMapPin, IconSparkles } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { humanize, sourceLabel } from "@/lib/media/labels";
import type { Analysis, MediaItem } from "@/lib/media/types";
import { MetaItem, MetricList, MoodBadges, moodTone, Tags, TargetTag } from "./itemParts";
import classes from "./card.module.css";

const MAX_CARD_TAGS = 4;

// AI summary and tags only; the full analysis lives in the detail modal.
function AnalysisPreview({ analysis }: { analysis: Analysis }) {
  const tags = [...analysis.signals, ...analysis.topics];
  if (!analysis.summary && !analysis.target && !tags.length) return null;
  return (
    <div className={classes.analysis}>
      {analysis.summary && <p className={classes.summary}><IconSparkles size={14} /><span>{analysis.summary}</span></p>}
      {(analysis.target || tags.length > 0) && (
        <Tags values={tags} limit={MAX_CARD_TAGS}>{analysis.target && <TargetTag target={analysis.target} />}</Tags>
      )}
    </div>
  );
}

export function ItemCard({ item, delay, onOpen }: { item: MediaItem; delay: number; onOpen: (item: MediaItem) => void }) {
  const [hasImage, setHasImage] = useState(!!item.image);
  const place = item.province ?? item.location;
  const open = () => onOpen(item);

  return (
    <article
      className={classes.card}
      role="button"
      tabIndex={0}
      aria-label="Lihat detail"
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      style={{ animationDelay: `${delay}ms`, ["--tone" as string]: moodTone(item) }}
    >
      {hasImage && (
        <div className={classes.media}>
          {/* Remote images from many news hosts; next/image would need every domain allow-listed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image!} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setHasImage(false)} />
        </div>
      )}
      <div className={classes.body}>
        <Group gap={8} justify="space-between" wrap="nowrap">
          <Text fz={12.5} fw={800} truncate>{sourceLabel(item.source)}</Text>
          <MoodBadges item={item} />
        </Group>
        {item.title && <Text fw={700} fz={15} lh={1.35} lineClamp={3}>{item.title}</Text>}
        {item.content && (
          <Text fz={13.5} lh={1.55} c={item.title ? "dimmed" : undefined} lineClamp={item.title ? 3 : 7} className={classes.content}>{item.content}</Text>
        )}
        {item.analysis && <AnalysisPreview analysis={item.analysis} />}
        <div className={classes.footer}>
          <Group gap={10}>
            <MetaItem icon={IconClock}>{dayjs(item.publishedAt).locale("id").format("D MMM YYYY, HH:mm")}</MetaItem>
            {place && <MetaItem icon={IconMapPin}>{place}</MetaItem>}
            {item.category && <MetaItem capitalize>#{humanize(item.category)}</MetaItem>}
          </Group>
          <Group gap={10} justify="space-between">
            <Group gap={10}><MetricList metrics={item.metrics} /></Group>
            <span className={classes.detailHint}>Detail <IconArrowRight size={13} /></span>
          </Group>
        </div>
      </div>
    </article>
  );
}
