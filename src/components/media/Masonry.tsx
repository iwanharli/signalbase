"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { MAX_COLUMNS } from "./CardSkeleton";
import classes from "./browser.module.css";

const MIN_COLUMN_WIDTH = 300;
const GAP = 16;

/**
 * Cards dealt into as many columns as fit (at most MAX_COLUMNS). By default round-robin by index; with `heights`
 * (each card's expected height, any unit, e.g. from the photo's aspect ratio) each card goes to the shortest column so far.
 * Both deal in order, so appending a page never moves cards that are already on screen.
 */
export function Masonry({ children, heights, minColumnWidth = MIN_COLUMN_WIDTH }: { children: React.ReactNode[]; heights?: number[]; minColumnWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  // Layout effect: measured before the first paint, so the grid never flashes as one column when it mounts.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (width: number) => setColumnCount(Math.min(MAX_COLUMNS, Math.max(1, Math.floor((width + GAP) / (minColumnWidth + GAP)))));
    fit(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => fit(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [minColumnWidth]);

  const columns: React.ReactNode[][] = Array.from({ length: columnCount }, () => []);
  const filled = new Array<number>(columnCount).fill(0);
  children.forEach((child, i) => {
    const c = heights ? filled.indexOf(Math.min(...filled)) : i % columnCount;
    columns[c].push(child);
    filled[c] += heights?.[i] ?? 1;
  });
  return (
    <div ref={ref} className={classes.masonry}>
      {columns.map((column, c) => <div key={c} className={classes.column}>{column}</div>)}
    </div>
  );
}
