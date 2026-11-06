"use client";
import { Anchor, Badge, Button, Checkbox, Group, Select, Text, Tooltip } from "@mantine/core";
import { IconArrowBackUp, IconCheck, IconClock, IconExternalLink, IconEye, IconHeart, IconMapPin, IconMessageCircle, IconRepeat, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { moodInfo } from "@/lib/mood";
import classes from "./curation.module.css";

export type QueueItem = {
  code: string; source: string; title: string | null; content: string | null; url: string | null; image: string | null;
  category: string | null; province: string | null; location: string | null; publishedAt: string; postType: string | null;
  mood: string | null; moodSource?: string | null; moodLevel: number | null; note?: string | null; reviewedBy?: string; reviewedAt?: string;
  metrics: { likes: number | null; comments: number | null; shares: number | null; views: number | null } | null;
};

const SOURCES: Record<string, string> = { twitter: "X / Twitter", threads: "Threads", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube" };
const sourceLabel = (s: string) => SOURCES[s] ?? s.replace(/^news-/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Metric({ icon: I, v }: { icon: typeof IconEye; v: number | null | undefined }) {
  return v == null ? null : <span className={classes.metric}><I size={14} />{v.toLocaleString("id-ID")}</span>;
}

export function ItemCard({ item, status, selected, onSelect, moods, onMood, onAct, busy }: {
  item: QueueItem; status: string; selected: boolean; onSelect: (v: boolean) => void;
  moods: string[]; onMood: (m: string | null) => void; onAct: (s: "approved" | "rejected" | "pending") => void; busy: boolean;
}) {
  const place = item.province ?? item.location;
  const corrected = item.moodSource !== undefined && item.mood !== item.moodSource;
  return (
    <article className={classes.card} data-selected={selected || undefined}>
      <Checkbox checked={selected} onChange={(e) => onSelect(e.currentTarget.checked)} aria-label="Pilih" className={classes.check} />
      <div className={classes.body}>
        <Group gap={8} wrap="nowrap">
          <Text fz={13} fw={700}>{sourceLabel(item.source)}</Text>
          <span className={classes.metric}><IconClock size={13} />{dayjs(item.publishedAt).locale("id").format("D MMM YYYY, HH:mm")}</span>
          {item.postType && <Badge size="xs" variant="default">{item.postType}</Badge>}
        </Group>
        {item.title && <Text fw={700} fz={15} lh={1.35}>{item.title}</Text>}
        {item.content && <Text fz={14} lh={1.55} c={item.title ? "dimmed" : undefined} lineClamp={6} className={classes.content}>{item.content}</Text>}
        <Group gap={6}>
          {item.category && <Badge size="sm" radius="sm" variant="default" tt="capitalize">{item.category.replace(/_/g, " ")}</Badge>}
          {place && <span className={classes.metric}><IconMapPin size={13} />{place}</span>}
          <Metric icon={IconHeart} v={item.metrics?.likes} /><Metric icon={IconMessageCircle} v={item.metrics?.comments} />
          <Metric icon={IconRepeat} v={item.metrics?.shares} /><Metric icon={IconEye} v={item.metrics?.views} />
          {item.url && <Anchor href={item.url} target="_blank" rel="noopener noreferrer nofollow" fz={12} fw={600}>Sumber <IconExternalLink size={12} /></Anchor>}
        </Group>
        <Group justify="space-between" gap="sm" className={classes.actions}>
          <Group gap={8}>
            <Select size="xs" w={170} placeholder="Belum dianalisis" value={item.mood} onChange={onMood} clearable searchable
              data={[...new Set([...moods, ...(item.mood ? [item.mood] : [])])].map((v) => ({ value: v, label: moodInfo(v).label }))}
              leftSection={item.mood ? <span className={classes.dot} style={{ background: `var(--mantine-color-${moodInfo(item.mood).color}-6)` }} /> : undefined}
              aria-label="Label emosi/sentimen" />
            {item.moodLevel ? <Text fz={12} c="dimmed">intensitas {item.moodLevel}/5</Text> : null}
            {corrected && <Tooltip label={`Label asli: ${item.moodSource ? moodInfo(item.moodSource).label : "kosong"}`}><Badge size="xs" color="violet" variant="light">dikoreksi</Badge></Tooltip>}
          </Group>
          <Group gap={6}>
            {status !== "pending" && <Button size="xs" variant="subtle" color="gray" leftSection={<IconArrowBackUp size={14} />} onClick={() => onAct("pending")} disabled={busy}>Antrean</Button>}
            {status !== "rejected" && <Button size="xs" variant="light" color="red" leftSection={<IconX size={14} />} onClick={() => onAct("rejected")} disabled={busy}>Tolak</Button>}
            {status !== "approved" && <Button size="xs" color="teal" leftSection={<IconCheck size={14} />} onClick={() => onAct("approved")} disabled={busy}>Setujui</Button>}
          </Group>
        </Group>
        {item.reviewedBy && <Text fz={11} c="dimmed">Ditinjau {item.reviewedBy} · {dayjs(item.reviewedAt).locale("id").format("D MMM YYYY HH:mm")}</Text>}
      </div>
    </article>
  );
}
