// Info chip of the network pages (SNA, Ontologi), floating at the bottom right of the canvas: icon, title with the
// period, what the view is focused on, and a few counts, on one small line, so the graph keeps the whole screen.
import type { Icon } from "@tabler/icons-react";
import { formatNumber } from "@/lib/media/labels";
import classes from "./sna.module.css";

export function NetworkHeader({ icon: HeadIcon, kicker, title, period, focus, stats, ready }: {
  icon: Icon; kicker: string; title: string; period: string; focus?: React.ReactNode;
  stats: { icon: Icon; value: number; label: string }[]; ready: boolean;
}) {
  return (
    <header className={classes.info} aria-label={kicker}>
      <span className={classes.infoIcon} aria-hidden><HeadIcon size={14} /></span>
      <h1>{title} <em>{period}</em></h1>
      {focus && <p className={classes.infoFocus}>{focus}</p>}
      <span className={classes.infoStats}>
        {stats.map((x) => <span key={x.label}><b>{ready ? formatNumber(x.value) : "—"}</b> {x.label}</span>)}
      </span>
    </header>
  );
}
