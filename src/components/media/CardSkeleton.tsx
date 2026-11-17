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

export function CardSkeleton({ index, type }: { index: number; type: MediaType }) {
  const shape = SHAPES[index % SHAPES.length];
  const online = type === "online";
  return (
    <div className={c.card} style={{ animationDelay: `${(index % 8) * 70}ms` }} aria-hidden>
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
export function SkeletonGrid({ type, count = 8 }: { type: MediaType; count?: number }) {
  return (
    <div className={c.grid} role="status" aria-label={type === "social" ? "Memuat post" : "Memuat berita"}>
      {Array.from({ length: MAX_COLUMNS }, (_, col) => (
        <div key={col} className={c.column}>
          {Array.from({ length: Math.ceil(count / MAX_COLUMNS) }, (_, row) => <CardSkeleton key={row} index={row * MAX_COLUMNS + col} type={type} />)}
        </div>
      ))}
    </div>
  );
}
