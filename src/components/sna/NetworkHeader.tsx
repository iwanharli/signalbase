// One-line header of the network pages (SNA, Ontologi): icon, title with the period, what the view is focused on, and
// a few counts. Slim so the canvas gets the screen.
import type { Icon } from "@tabler/icons-react";
import { formatNumber } from "@/lib/media/labels";
import classes from "./sna.module.css";

export function NetworkHeader({ icon: HeadIcon, kicker, title, period, focus, stats, ready }: {
  icon: Icon; kicker: string; title: string; period: string; focus?: React.ReactNode;
  stats: { icon: Icon; value: number; label: string }[]; ready: boolean;
}) {
  return (
    <header className={classes.bar}>
      <span className={classes.barIcon} aria-hidden><HeadIcon size={19} /></span>
      <div className={classes.barTitle}>
        <span className={classes.barKicker}>{kicker}</span>
        <h1>{title} <em>{period}</em></h1>
      </div>
      {focus && <p className={classes.barFocus}>{focus}</p>}
      <div className={classes.barStats}>
        {stats.map((x) => <div key={x.label}><x.icon size={15} aria-hidden /><b>{ready ? formatNumber(x.value) : "—"}</b><span>{x.label}</span></div>)}
      </div>
    </header>
  );
}
