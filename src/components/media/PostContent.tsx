import type { ReactNode } from "react";
import type { Metrics } from "@/lib/media/types";
import { MetricList } from "./itemParts";
import { PostText } from "./PostText";
import classes from "./postContent.module.css";

/** One content layout for source previews and stored posts from every platform. */
export function PostContent({ text, title, metrics, header, children, hideEmptyText = false, textClassName }: {
  text: string | null; title?: string | null; metrics: Metrics; header?: ReactNode; children?: ReactNode; hideEmptyText?: boolean; textClassName?: string;
}) {
  const hasMetrics = Object.values(metrics).some((value) => value != null);
  return <div className={classes.content}>
    {header}
    {title && <h3 className={classes.title}>{title}</h3>}
    {text ? <p className={`${classes.text} ${textClassName ?? ""}`}><PostText text={text} /></p> : !hideEmptyText && <p className={classes.empty}>Teks tidak tersedia.</p>}
    {children}
    {hasMetrics && <div className={classes.metrics} role="group" aria-label="Interaksi"><MetricList metrics={metrics} /></div>}
  </div>;
}
