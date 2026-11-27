"use client";
// Similar images (same near-duplicate group as one image): thumbnails with their source and time; a click opens the
// post/article that uses it. Loaded only when the image has twins.
import { IconCopy } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { Skeleton } from "@mantine/core";
import { formatNumber, sourceLabel } from "@/lib/media/labels";
import type { MediaItem, MediaType } from "@/lib/media/types";
import type { VisualTwin } from "@/lib/mediaVisual";
import { useApi } from "@/lib/useApi";
import { useProjectId } from "@/lib/useProjectId";
import m from "../media/modal.module.css";
import c from "./mediaVisual.module.css";
import { VisualImage } from "./VisualImage";

dayjs.extend(relativeTime);

export function Twins({ assetId, count, label, onPost }: { assetId: string; count: number; label?: string; onPost: (item: MediaItem, type: MediaType) => void }) {
  // The page's project (users always have one): twins are looked up within it.
  const keyId = useProjectId();
  const res = useApi<{ total: number; twins: VisualTwin[] }>(count > 0 ? `/api/admin/media-visual/twins?id=${encodeURIComponent(assetId)}${keyId ? `&project=${encodeURIComponent(keyId)}` : ""}` : null);
  if (count <= 0) return null;
  const total = res.data?.total ?? count;
  return (
    <section className={m.contextSection}>
      <h3><IconCopy size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{label ? `${label} · ` : ""}Gambar mirip ({formatNumber(total)})</h3>
      <p className={m.sectionNote}>Gambar yang sama atau hampir sama (di-resize, dikompres, atau diberi sedikit tambahan) di URL lain.</p>
      <div className={c.twinGrid}>
        {res.data ? res.data.twins.map((t) => (
          <button key={t.id} type="button" className={c.twin} disabled={!t.use.item} onClick={() => t.use.item && onPost(t.use.item, t.use.type)}
            title={t.use.item ? (t.use.item.title ?? t.use.item.content ?? "").slice(0, 160) : "Item tidak ditemukan di bank data"}>
            <VisualImage src={t.url} loading="lazy" />
            <span><b>{sourceLabel(t.use.source)}</b><small>{dayjs(t.use.publishedAt).locale("id").fromNow()}</small></span>
          </button>
        )) : Array.from({ length: Math.min(count, 4) }, (_, i) => <Skeleton key={i} h={96} radius={10} />)}
      </div>
      {res.data && res.data.total > res.data.twins.length && <p className={m.sectionNote}>Menampilkan {res.data.twins.length} terbaru.</p>}
    </section>
  );
}
