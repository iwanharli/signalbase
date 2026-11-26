"use client";
// Masonry that fills up: every card is measured and goes to the column that is shortest at that moment, so columns stay
// level however tall the posts are (an original X embed can be five times a short one). Cards are absolutely positioned in
// one container, so placing or moving one never remounts it (embeds are not loaded again). A card keeps its column once
// placed; only a different column count (resize) deals them again. Hidden cards (a page being prepared) are laid out and
// measured out of sight, then placed at once when shown.
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { MAX_COLUMNS } from "./CardSkeleton";
import classes from "./flowMasonry.module.css";

const MIN_COLUMN_WIDTH = 300;
const GAP = 16;

export type FlowItem = { key: string; node: React.ReactNode; hidden?: boolean };

export function FlowMasonry({ items, tail, sentinelRef, maxColumns = MAX_COLUMNS }: {
  items: FlowItem[];
  /** Columns the reader chose (1-4); fewer when the screen is too narrow for them. */
  maxColumns?: number;
  /** Placeholder shown at the bottom of each column (e.g. while the next page loads). */
  tail?: (column: number) => React.ReactNode;
  /** Put at the bottom of the shortest column: infinite scroll fires when the first gap would open, not the last. */
  sentinelRef?: React.Ref<HTMLDivElement>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const columnOf = useRef(new Map<string, number>());
  const dealtFor = useRef(0);
  const tailRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [tailHeight, setTailHeight] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One observer for every card; heights arrive in batches.
  const observer = useRef<ResizeObserver | null>(null);
  const pending = useRef<Record<string, number>>({});
  const frame = useRef(0);
  if (!observer.current && typeof window !== "undefined") {
    observer.current = new ResizeObserver((entries) => {
      for (const e of entries) {
        const key = (e.target as HTMLElement).dataset.key;
        if (key) pending.current[key] = Math.round(e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).offsetHeight);
      }
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const batch = pending.current;
        pending.current = {};
        setHeights((h) => (Object.entries(batch).some(([k, v]) => h[k] !== v) ? { ...h, ...batch } : h));
      });
    });
  }
  // React 19 ref cleanup: a card that leaves the list stops being observed.
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    observer.current?.observe(el);
    return () => observer.current?.unobserve(el);
  }, []);
  useLayoutEffect(() => () => { observer.current?.disconnect(); cancelAnimationFrame(frame.current); }, []);

  const columns = width ? Math.min(maxColumns, MAX_COLUMNS, Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN_WIDTH + GAP)))) : 1;
  const colWidth = width ? (width - GAP * (columns - 1)) / columns : 0;
  if (dealtFor.current !== columns) { columnOf.current = new Map(); dealtFor.current = columns; } // new column count: deal again

  // Place, in order: a new card (height known) goes to the shortest column. Cards keep their column while they are on screen
  // or above it; heights still change after placing (embeds size themselves), so cards below the screen are dealt again to
  // the shortest column, unseen, and the columns are level by the time they are reached.
  const fold = typeof window === "undefined" || !box.current ? Infinity
    : window.scrollY + window.innerHeight * 1.5 - (box.current.getBoundingClientRect().top + window.scrollY);
  const bottoms = new Array<number>(columns).fill(0);
  const placed = new Map<string, { col: number; top: number }>();
  for (const it of items) {
    if (it.hidden) continue;
    const h = heights[it.key];
    let col = columnOf.current.get(it.key);
    if (col !== undefined && col < columns && bottoms[col] > fold && h !== undefined) col = undefined; // below the screen: deal again
    if (col === undefined || col >= columns) {
      if (h === undefined) continue; // not measured yet: placed on the next render
      col = bottoms.indexOf(Math.min(...bottoms));
      columnOf.current.set(it.key, col);
    }
    placed.set(it.key, { col, top: bottoms[col] });
    bottoms[col] += (h ?? 0) + GAP;
  }
  const shortest = Math.min(...bottoms);
  const tallest = Math.max(...bottoms);

  // The placeholders' height, so the container leaves room for them below the tallest column.
  const hasTail = !!tail;
  useLayoutEffect(() => {
    const h = hasTail ? Math.max(0, ...tailRefs.current.slice(0, columns).map((t) => t?.offsetHeight ?? 0)) : 0;
    setTailHeight((old) => (old === h ? old : h));
  }, [hasTail, columns, colWidth]);

  return (
    <div ref={box} className={classes.flow} style={{ height: Math.max(0, tail ? tallest + tailHeight : tallest - GAP) }}>
      {items.map((it) => {
        const at = placed.get(it.key);
        const left = at ? at.col * (colWidth + GAP) : 0;
        return (
          <div key={it.key} ref={measure} data-key={it.key} className={classes.item} data-hidden={!at || undefined} aria-hidden={!at || undefined}
            style={{ width: colWidth || "100%", transform: `translate(${left}px, ${at?.top ?? 0}px)` }}>
            {it.node}
          </div>
        );
      })}
      {tail && Array.from({ length: columns }, (_, c) => (
        <div key={`tail-${c}`} ref={(el) => { tailRefs.current[c] = el; }} className={classes.item} style={{ width: colWidth || "100%", transform: `translate(${c * (colWidth + GAP)}px, ${bottoms[c]}px)` }}>
          {tail(c)}
        </div>
      ))}
      {sentinelRef && <div ref={sentinelRef} className={classes.sentinel} style={{ top: shortest }} />}
    </div>
  );
}
