import { IconBrandFacebook, IconBrandInstagram, IconBrandThreads, IconBrandTiktok, IconBrandX, IconBrandYoutube, IconMessages, type Icon } from "@tabler/icons-react";
import classes from "./platformIcon.module.css";

const ICONS: Record<string, Icon> = {
  twitter: IconBrandX, x: IconBrandX, threads: IconBrandThreads,
  instagram: IconBrandInstagram, tiktok: IconBrandTiktok,
  facebook: IconBrandFacebook, youtube: IconBrandYoutube,
};

/** Unframed icon for compact controls; unknown/unselected platforms use a neutral mark. */
export function PlatformMark({ source, size = 15 }: { source?: string | null; size?: number }) {
  const Mark = ICONS[source?.trim().toLowerCase() ?? ""] ?? IconMessages;
  return <Mark size={size} stroke={1.8} aria-hidden />;
}

/** Decorative mark beside a visible platform name; no remote logo requests. */
export function PlatformIcon({ source, onDark }: { source: string; onDark?: boolean }) {
  const platform = source.trim().toLowerCase();
  return <span className={classes.mark} data-platform={platform} data-on-dark={onDark || undefined} aria-hidden><PlatformMark source={platform} /></span>;
}
