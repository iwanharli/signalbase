"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Group, Loader, Skeleton, Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import type { FilterOptions, MediaItem, MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import { AdvancedFilters } from "./AdvancedFilters";
import { ItemCard } from "./ItemCard";
import { ItemDetailModal } from "./ItemDetailModal";
import { Masonry } from "./Masonry";
import { QuickFilters } from "./QuickFilters";
import { StatsBar } from "./StatsBar";
import { useInfiniteScroll, useMediaFeed } from "./useMediaFeed";
import { useMediaFilters } from "./useMediaFilters";
import classes from "./browser.module.css";

const SKELETON_HEIGHTS = [260, 180, 320, 220];
const CARD_STAGGER_MS = 30;
const PAGE_SIZE = 24;

function ScrollTopButton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 900);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button type="button" className={classes.scrollTop} data-visible={visible || undefined} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Kembali ke atas">
      <IconArrowUp size={20} />
    </button>
  );
}

/** Browse every post (sosial) or article (online) in the bank, with filters, infinite scroll and a detail modal. */
export function MediaBrowser({ type }: { type: MediaType }) {
  const { filters, update, reset, query, advancedCount, activeCount } = useMediaFilters(type);
  const feed = useMediaFeed(type, query);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);

  const options = useApi<FilterOptions>(`/api/admin/media/${type}?view=options`);
  // The exact total is slow on large sets, so it loads on its own; sort doesn't change it.
  const countQuery = new URLSearchParams(query);
  countQuery.delete("sort");
  const count = useApi<{ total: number }>(`/api/admin/media/${type}?view=count&${countQuery}`);
  const total = count.data && !count.loading ? count.data.total : null;

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const sentinel = useInfiniteScroll(feed.hasMore && !feed.loading && !feed.error, feed.loadMore);

  return (
    <div className={classes.layout}>
      <AdvancedFilters
        type={type}
        open={drawerOpen}
        onClose={closeDrawer}
        escapeEnabled={!selected}
        filters={filters}
        onChange={update}
        onReset={reset}
        options={options.data}
        activeCount={activeCount}
        advancedCount={advancedCount}
        total={total}
      />

      <div className={classes.content}>
        <StatsBar
          type={type}
          filters={filters}
          total={total}
          totalError={!!count.error}
          shown={feed.items.length}
          moods={feed.moods}
          busy={feed.loading}
          onMoodChange={(mood) => update({ mood })}
        />
        <QuickFilters
          type={type}
          filters={filters}
          onChange={update}
          onReset={reset}
          activeCount={activeCount}
          advancedCount={advancedCount}
          advancedOpen={drawerOpen}
          onToggleAdvanced={() => setDrawerOpen((open) => !open)}
          busy={feed.loading}
        />

        {feed.error && (
          <Alert color="red" mb="md" title="Gagal memuat">
            {feed.error} <Button size="xs" variant="light" color="red" ml="sm" onClick={feed.retry}>Coba lagi</Button>
          </Alert>
        )}

        <Masonry>
          {[
            ...feed.items.map((item, i) => <ItemCard key={item.code} item={item} delay={(i % PAGE_SIZE) * CARD_STAGGER_MS} onOpen={setSelected} />),
            ...(feed.loading
              ? Array.from({ length: feed.items.length ? 4 : 12 }, (_, i) => <Skeleton key={`skeleton-${i}`} h={SKELETON_HEIGHTS[i % SKELETON_HEIGHTS.length]} radius={18} />)
              : []),
          ]}
        </Masonry>

        {feed.loaded && !feed.items.length && !feed.loading && <Text ta="center" c="dimmed" py={60}>Tidak ada data untuk filter ini.</Text>}
        <div ref={sentinel} />
        {feed.loading && feed.items.length > 0 && <Group justify="center" py="lg"><Loader type="dots" color="violet" /></Group>}
        {feed.loaded && !feed.hasMore && feed.items.length > 0 && <Text ta="center" fz={12.5} c="dimmed" py="xl">Semua data sudah ditampilkan.</Text>}

        <ScrollTopButton />
        <ItemDetailModal item={selected} type={type} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}
