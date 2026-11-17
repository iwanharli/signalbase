"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { MAX_COLUMNS } from "./CardSkeleton";
import classes from "./browser.module.css";

const MIN_COLUMN_WIDTH = 300;
const GAP = 16;

/**
 * Cards dealt round-robin into as many columns as fit (at most MAX_COLUMNS). Dealing by index (not by height) means
 * appending a page never moves cards that are already on screen.
 */
export function Masonry({ children }: { children: React.ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  // Layout effect: measured before the first paint, so the grid never flashes as one column when it mounts.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (width: number) => setColumnCount(Math.min(MAX_COLUMNS, Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN_WIDTH + GAP)))));
    fit(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => fit(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columns = Array.from({ length: columnCount }, (_, c) => children.filter((_, i) => i % columnCount === c));
  return (
    <div ref={ref} className={classes.masonry}>
      {columns.map((column, c) => <div key={c} className={classes.column}>{column}</div>)}
    </div>
  );
}
