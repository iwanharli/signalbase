"use client";
import { useEffect, useRef, useState } from "react";
import classes from "./browser.module.css";

const MIN_COLUMN_WIDTH = 300;
const GAP = 16;

/**
 * Cards dealt round-robin into as many columns as fit. Dealing by index (not by height) means
 * appending a page never moves cards that are already on screen.
 */
export function Masonry({ children }: { children: React.ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setColumnCount(Math.max(1, Math.floor((entry.contentRect.width + GAP) / (MIN_COLUMN_WIDTH + GAP)))));
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
