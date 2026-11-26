"use client";
import { useState } from "react";
import { Text } from "@mantine/core";
import { IconArrowRight, IconClock, IconCategory, IconMapPin, IconPhotoScan, IconSparkles } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { humanize, sourceLabel } from "@/lib/media/labels";
import { uniqueTags } from "@/lib/media/presentation";
import type { Analysis, MediaItem, MediaType } from "@/lib/media/types";
import { moodPolarity } from "@/lib/media/mood";
import { AiCategoryBadge, MetricList, MoodBadges, moodTone, Tags } from "./itemParts";
import { ManualLabelPicker } from "./ManualLabel";
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
    <div className={classes.analysis} data-tags-only title="Topik dari analisis AI, bukan tagar dari post">
      <Tags values={tags} limit={MAX_CARD_TAGS}><span className={classes.topicLabel}><IconSparkles size={11} />Topik AI</span></Tags>
    </div>
  );
}

const authorName = (item: MediaItem) => item.author?.name?.trim().replace(/^[-–—.\s]+$/, "") || null; // some outlets send "-" for no byline

/** A social post's platform, author and handle (shared by the Quick and Original View cards). */
export function PostAuthor({ item, type }: { item: MediaItem; type: MediaType }) {
  const author = authorName(item);
  const publisher = sourceLabel(item.source);
  const handle = item.author?.username ? `@${item.author.username.replace(/^@/, "")}` : null;
  return (
    <div className={classes.platformName}>
      {type === "social" && <PlatformIcon source={item.source} />}
      {author ? <div className={classes.authorName}>
        <Text fz={12.5} fw={800} truncate title={author}>{author}</Text>
        <Text className={classes.sourceName} fz={11} fw={600} truncate>{[handle, publisher].filter(Boolean).join(" · ")}</Text>
      </div> : <Text className={classes.sourceName} fz={12.5} fw={800} truncate>{publisher}</Text>}
    </div>
  );
}

/** Post type and category chips of a social post. */
export function PostMeta({ item }: { item: MediaItem }) {
  if (!item.postType && !item.category) return null;
  return (
    <div className={classes.postMeta}>
      {item.postType && <PostTypeBadge value={item.postType} />}
      {item.category && <span className={classes.postCategory} title={humanize(item.category)}>{humanize(item.category)}</span>}
    </div>
  );
}

/** Time, place, link to the source and the Detail button. */
export function CardFooter({ item, type, onOpen, children }: { item: MediaItem; type: MediaType; onOpen: (item: MediaItem) => void; children?: React.ReactNode }) {
  const place = item.province ?? item.location;
  const published = dayjs(item.publishedAt).locale("id");
  return (
    <div className={classes.footer}>
      <div className={classes.footerMeta}>
        <time dateTime={item.publishedAt} title={published.format("D MMMM YYYY, HH:mm")}>
          <IconClock size={13} aria-hidden />{published.format("D MMM · HH:mm")}
        </time>
        {place && <span className={classes.footerPlace} title={place}><IconMapPin size={13} aria-hidden /><span>{place}</span></span>}
      </div>
      <div className={classes.footerActions}>
        <SourceLink item={item} type={type} />
        <button type="button" className={classes.detailHint} aria-label={`Lihat detail: ${item.title || item.content?.slice(0, 100) || sourceLabel(item.source)}`} onClick={(event) => { event.stopPropagation(); onOpen(item); }}>Detail <IconArrowRight size={13} aria-hidden /></button>
      </div>
      {children}
    </div>
  );
}

export function ItemCard({ item, type, delay, onOpen }: { item: MediaItem; type: MediaType; delay: number; onOpen: (item: MediaItem) => void }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const hasImage = !!item.image && item.image !== failedImage;
  const editorial = type === "online" && !hasImage;
  const publisher = sourceLabel(item.source);
  const author = authorName(item);
  const hasMetrics = Object.values(item.metrics).some((value) => value != null);
  const open = () => onOpen(item);
  const online = type === "online";
  // News: the category and the AI topics share one chip row (the topics are not hashtags of the article).
  const topics = online && item.analysis
    ? uniqueTags(item.analysis.topics).filter((t) => humanize(t).toLowerCase() !== humanize(item.category ?? "").toLowerCase()).slice(0, MAX_CARD_TAGS) : [];

  return (
    <article
      className={classes.card}
      data-editorial={editorial || undefined}
      data-type={type}
      data-polarity={item.mood ? moodPolarity(item.mood) : undefined}
      onClick={open}
      style={{ animationDelay: `${delay}ms`, ["--tone" as string]: moodTone(item) }}
    >
      <ManualLabelPicker item={item} />
      {hasImage && (
        <div className={classes.media}>
          {/* Remote images from many news hosts; next/image would need every domain allow-listed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image!} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(item.image)} />
        </div>
      )}
      <div className={classes.body}>
        <div className={classes.sourceRow}>
          {online ? (
            <div className={classes.publisher}>
              <span className={classes.publisherMark} aria-hidden>{publisher.charAt(0)}</span>
              <div>
                <Text className={classes.sourceName} fz={13} fw={800} truncate title={publisher}>{publisher}</Text>
                <small title={author ?? undefined}>{author ? `oleh ${author}` : "Media online"}</small>
              </div>
            </div>
          ) : <PostAuthor item={item} type={type} />}
          <MoodBadges item={item} type={type} />
        </div>
        {type === "social" && <PostMeta item={item} />}
        {item.title && <Text className={classes.headline} lineClamp={3}>{item.title}</Text>}
        {item.content && (
          <Text fz={13.5} lh={1.55} c={item.title ? "dimmed" : undefined} lineClamp={type === "social" ? 5 : item.title ? 2 : 7} className={classes.content}>{type === "social" ? <PostText text={item.content} /> : item.content}</Text>
        )}
        {item.matchedByImage && <span className={classes.imageMatch} title="Kata kunci proyek ada di teks gambar post ini, bukan di teks post-nya"><IconPhotoScan size={12} />Kata kunci di gambar</span>}
        <AiCategoryBadge item={item} />
        {!online && item.analysis && <AnalysisPreview analysis={item.analysis} />}
        {online && (item.category || topics.length > 0) && (
          <div className={classes.chips}>
            {item.category && <span className={classes.chip} data-kind="category" title={`Kategori: ${humanize(item.category)}`}><IconCategory size={11} aria-hidden />{humanize(item.category)}</span>}
            {topics.map((t) => <span key={t} className={classes.chip} data-kind="topic" title="Topik dari analisis AI, bukan tagar dari berita"><IconSparkles size={10} aria-hidden />{humanize(t)}</span>)}
          </div>
        )}
        {type === "social" && hasMetrics && <div className={classes.socialMetrics} role="group" aria-label="Interaksi post"><MetricList metrics={item.metrics} compact /></div>}
        <CardFooter item={item} type={type} onOpen={onOpen}>
          {type !== "social" && hasMetrics && (
            <div className={classes.footerBottom}>
              <div className={classes.footerMetrics}><MetricList metrics={item.metrics} /></div>
            </div>
          )}
        </CardFooter>
      </div>
    </article>
  );
}
