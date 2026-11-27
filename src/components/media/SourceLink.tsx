"use client";
import { Tooltip } from "@mantine/core";
import { IconExternalLink, IconUserCircle } from "@tabler/icons-react";
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

/** Social posts: the poster's profile on its platform (new tab). Only http(s) links from the data are used. */
export function ProfileLink({ item, onDark }: { item: MediaItem; onDark?: boolean }) {
  const href = item.author?.profileUrl;
  if (!href || !/^https?:\/\//i.test(href)) return null;
  const who = item.author?.username ? `@${item.author.username}` : item.author?.name ?? "akun";
  const label = `Buka profil ${who}`;
  return (
    <Tooltip label={label} withArrow events={{ hover: true, focus: true, touch: true }}>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={classes.link} data-on-dark={onDark || undefined}
        aria-label={`${label} (tab baru)`} onClick={(event) => event.stopPropagation()}>
        <IconUserCircle size={16} stroke={1.7} aria-hidden />
      </a>
    </Tooltip>
  );
}
