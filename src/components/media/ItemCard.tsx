"use client";
import { useState } from "react";
import { Text } from "@mantine/core";
import { IconArrowRight, IconClock, IconMapPin } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { humanize, sourceLabel } from "@/lib/media/labels";
import { uniqueTags } from "@/lib/media/presentation";
import type { Analysis, MediaItem, MediaType } from "@/lib/media/types";
import { AiCategoryBadge, MetricList, MoodBadges, moodTone, Tags } from "./itemParts";
import { PostText } from "./PostText";
import { PlatformIcon } from "./PlatformIcon";
import { PostTypeBadge } from "./PostTypeBadge";
import { SourceLink } from "./SourceLink";
import classes from "./card.module.css";

const MAX_CARD_TAGS = 3;

// Cards show only topics; signals, targets and summaries stay in the detail modal.
function AnalysisPreview({ analysis }: { analysis: Analysis }) {
  const tags = uniqueTags(analysis.topics);
  if (!tags.length) return null;
  return (
    <div className={classes.analysis} data-tags-only>
      <Tags values={tags} limit={MAX_CARD_TAGS} />
    </div>
  );
}

export function ItemCard({ item, type, delay, onOpen }: { item: MediaItem; type: MediaType; delay: number; onOpen: (item: MediaItem) => void }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const hasImage = !!item.image && item.image !== failedImage;
  const editorial = type === "online" && !hasImage;
  const publisher = sourceLabel(item.source);
  const author = item.author?.name || null;
  const handle = item.author?.username ? `@${item.author.username.replace(/^@/, "")}` : null;
  const place = item.province ?? item.location;
  const hasMetrics = Object.values(item.metrics).some((value) => value != null);
  const published = dayjs(item.publishedAt).locale("id");
  const open = () => onOpen(item);

  return (
    <article
      className={classes.card}
      data-editorial={editorial || undefined}
      data-type={type}
      onClick={open}
      style={{ animationDelay: `${delay}ms`, ["--tone" as string]: moodTone(item) }}
    >
      {hasImage && (
        <div className={classes.media}>
          {/* Remote images from many news hosts; next/image would need every domain allow-listed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image!} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(item.image)} />
        </div>
      )}
      <div className={classes.body}>
        <div className={classes.sourceRow}>
          {editorial ? (
            <div className={classes.publisher}>
              <span className={classes.publisherMark} aria-hidden>{publisher.charAt(0)}</span>
              <div><small>Media online</small><Text className={classes.sourceName} fz={12.5} fw={700} truncate>{publisher}</Text></div>
            </div>
          ) : <div className={classes.platformName}>
            {type === "social" && <PlatformIcon source={item.source} />}
            {author ? <div className={classes.authorName}>
              <Text fz={12.5} fw={800} truncate title={author}>{author}</Text>
              <Text className={classes.sourceName} fz={11} fw={600} truncate>{[handle, publisher].filter(Boolean).join(" · ")}</Text>
            </div> : <Text className={classes.sourceName} fz={12.5} fw={800} truncate>{publisher}</Text>}
          </div>}
          <MoodBadges item={item} type={type} />
        </div>
        {type === "social" && (item.postType || item.category) && (
          <div className={classes.postMeta}>
            {item.postType && <PostTypeBadge value={item.postType} />}
            {item.category && <span className={classes.postCategory} title={humanize(item.category)}>{humanize(item.category)}</span>}
          </div>
        )}
        {item.title && <Text className={classes.headline} lineClamp={3}>{item.title}</Text>}
        {item.content && (
          <Text fz={13.5} lh={1.55} c={item.title ? "dimmed" : undefined} lineClamp={type === "social" ? 5 : item.title ? 2 : 7} className={classes.content}>{type === "social" ? <PostText text={item.content} /> : item.content}</Text>
        )}
        <AiCategoryBadge item={item} />
        {item.analysis && <AnalysisPreview analysis={item.analysis} />}
        {type === "social" && hasMetrics && <div className={classes.socialMetrics} role="group" aria-label="Interaksi post"><MetricList metrics={item.metrics} compact /></div>}
        <div className={classes.footer}>
          <div className={classes.footerMeta}>
            <time dateTime={item.publishedAt} title={published.format("D MMMM YYYY, HH:mm")}>
              <IconClock size={13} aria-hidden />{published.format("D MMM · HH:mm")}
            </time>
            {place && <span className={classes.footerPlace} title={place}><IconMapPin size={13} aria-hidden /><span>{place}</span></span>}
            {type !== "social" && item.category && <span className={classes.footerCategory} title={humanize(item.category)}>#{humanize(item.category)}</span>}
          </div>
          <div className={classes.footerActions}>
            <SourceLink item={item} type={type} />
            <button type="button" className={classes.detailHint} aria-label={`Lihat detail: ${item.title || item.content?.slice(0, 100) || publisher}`} onClick={(event) => { event.stopPropagation(); open(); }}>Detail <IconArrowRight size={13} aria-hidden /></button>
          </div>
          {type !== "social" && hasMetrics && (
            <div className={classes.footerBottom}>
              <div className={classes.footerMetrics}><MetricList metrics={item.metrics} /></div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
