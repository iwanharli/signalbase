// Placeholder shaped like a media card (author row, text, sometimes an image, footer), so the grid keeps its layout while
// loading. No hooks: also used by the route's loading.tsx.
import type { MediaType } from "@/lib/media/types";
import c from "./skeleton.module.css";

/** Columns the grid uses at most; Masonry and the loading grid share it. */
export const MAX_COLUMNS = 4;

// Fixed variety (image or not, text length) so the placeholders don't look like one block repeated.
const SHAPES = [
  { image: false, lines: [100, 94, 88, 60] },
  { image: true, lines: [100, 72] },
  { image: false, lines: [100, 90, 45] },
  { image: true, lines: [96, 100, 80, 52] },
  { image: false, lines: [100, 97, 92, 85, 40] },
  { image: false, lines: [88, 64] },
];

export function CardSkeleton({ index, type, original }: { index: number; type: MediaType; original?: boolean }) {
  const shape = SHAPES[index % SHAPES.length];
  const online = type === "online";
  return (
    <div className={c.card} style={{ ["--sweep-delay" as string]: `${(index % 4) * 180}ms` }} aria-hidden>
      {/* Original View cards open with the "Post asli | Data tersimpan" switch. */}
      {original && <div className={c.tabs}><span className={c.sk} /><span className={c.sk} /></div>}
      {(shape.image || online) && <div className={`${c.sk} ${c.image}`} data-short={online && !shape.image || undefined} />}
      <div className={c.body}>
        <div className={c.head}>
          <span className={`${c.sk} ${c.avatar}`} data-square={online || undefined} />
          <span className={c.who}><span className={c.sk} style={{ width: "62%" }} /><span className={c.sk} data-thin style={{ width: "40%" }} /></span>
          <span className={`${c.sk} ${c.pill}`} />
        </div>
        {online && <span className={`${c.sk} ${c.title}`} />}
        <div className={c.lines}>{shape.lines.map((w, i) => <span key={i} className={c.sk} style={{ width: `${w}%` }} />)}</div>
        <div className={c.foot}><span className={c.sk} data-thin style={{ width: 92 }} /><span className={`${c.sk} ${c.pill}`} /></div>
      </div>
    </div>
  );
}

/** A full grid of placeholders for the first load. */
export function SkeletonGrid({ type, count = 8, original }: { type: MediaType; count?: number; original?: boolean }) {
  return (
    <div className={c.grid} role="status" aria-label={type === "social" ? "Memuat post" : "Memuat berita"}>
      {Array.from({ length: MAX_COLUMNS }, (_, col) => (
        <div key={col} className={c.column}>
          {Array.from({ length: Math.ceil(count / MAX_COLUMNS) }, (_, row) => <CardSkeleton key={row} index={row * MAX_COLUMNS + col} type={type} original={original} />)}
        </div>
      ))}
    </div>
  );
}

const bar = (width: number | string, height = 11, extra = "") => <span className={`${c.sk} ${extra}`} style={{ width, height }} />;

/** The whole media page while it loads: summary, toolbar and a grid of cards (the route's loading screen and the page
 *  before it is ready use the same one, so the switch between them does not show). */
export function MediaPageSkeleton({ type }: { type: MediaType }) {
  return (
    <div className={c.bars} aria-busy>
      <div className={c.stats}>
        <div>
          <div className={c.row}>{bar(34, 34)}{bar(110, 14)}<span style={{ flex: 1 }} />{bar(120, 28)}{bar(48, 28)}</div>
          <div className={c.row}>{bar(110, 24)}{bar(120, 24)}{bar(110, 24)}{bar(120, 24)}</div>
        </div>
        <div>{bar("40%", 12)}{bar("100%", 12)}<div className={c.row}>{bar("19%", 40)}{bar("19%", 40)}{bar("19%", 40)}{bar("19%", 40)}{bar("19%", 40)}</div></div>
      </div>
      <div className={c.quick}>{bar(140, 38, c.control)}<span className={`${c.sk} ${c.control}`} style={{ flex: 1 }} />{bar(270, 38, c.control)}{bar(160, 38, c.control)}{bar(210, 38, c.control)}</div>
      <SkeletonGrid type={type} original={type === "social"} />
    </div>
  );
}
