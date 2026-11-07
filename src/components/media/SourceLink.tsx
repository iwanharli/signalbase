"use client";
import { Tooltip } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import type { MediaItem, MediaType } from "@/lib/media/types";
import { sourceUrl } from "@/lib/media/sourceUrl";
import classes from "./sourceLink.module.css";

export function SourceLink({ item, type, onDark }: { item: MediaItem; type: MediaType; onDark?: boolean }) {
  const href = sourceUrl(item, type);
  if (!href) return null;
  const label = type === "social" ? "Buka post asli" : "Buka berita asli";
  return (
    <Tooltip label={label} withArrow events={{ hover: true, focus: true, touch: true }}>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={classes.link} data-on-dark={onDark || undefined}
        aria-label={`${label} (tab baru)`} onClick={(event) => event.stopPropagation()}>
        <IconExternalLink size={16} stroke={1.7} aria-hidden />
      </a>
    </Tooltip>
  );
}
