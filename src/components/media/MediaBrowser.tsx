"use client";
import { categoriesForType } from "@/lib/ai/classifier";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Group, Loader, Skeleton, Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import type { Category } from "@/lib/ai/classifier";
import { allowsType, type KeyScope } from "@/lib/media/keyScope";
import type { FilterOptions, MediaItem, MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import { ActiveFilters } from "./ActiveFilters";
import { AdvancedFilters } from "./AdvancedFilters";
import { ItemCard } from "./ItemCard";
import { ItemDetailModal } from "./ItemDetailModal";
import { KeyViewBanner, type KeyView } from "./KeyViewBanner";
import { Masonry } from "./Masonry";
import { QuickFilters } from "./QuickFilters";
import { StatsBar } from "./StatsBar";
import { useInfiniteScroll, useMediaFeed } from "./useMediaFeed";
import { useMediaFilters } from "./useMediaFilters";
import classes from "./browser.module.css";
import keyViewClasses from "./keyView.module.css";

type KeyResponse = { key: { id: string; name: string; scope: KeyScope }; classifier: { enabled: boolean; categories: Category[]; onlineCategories: Category[] | null } | null };

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
    <button type="button" className={classes.scrollTop} data-visible={visible || undefined} tabIndex={visible ? 0 : -1} aria-hidden={!visible} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Kembali ke atas">
      <IconArrowUp size={20} />
    </button>
  );
}

/** Browse every post (social) or article (online) in the bank, with filters, infinite scroll and a detail modal.
 *  With ?key=<id> the page shows the bank as that API key sees it: its scope, and its AI categories. */
export function MediaBrowser({ type, keyLocked = false }: { type: MediaType; keyLocked?: boolean }) {
  const searchParams = useSearchParams();
  const keyId = searchParams.get("key");
  const viewMode = searchParams.get("layout") === "list" ? "list" : "cards";
  const changeView = (layout: "cards" | "list") => {
    const url = new URL(window.location.href);
    url.searchParams.set("layout", layout);
    window.history.replaceState(null, "", url);
  };
  const keyInfo = useApi<KeyResponse>(keyId ? `/api/admin/keys/${keyId}/classifier` : null);
  const view: KeyView | null = keyInfo.data
    ? { id: keyInfo.data.key.id, name: keyInfo.data.key.name, scope: keyInfo.data.key.scope, aiEnabled: !!keyInfo.data.classifier?.enabled }
    : null;
  const aiCategories = keyInfo.data?.classifier ? (categoriesForType(keyInfo.data.classifier, type) as Category[]) : null;
  const blocked = !!view && !allowsType(view.scope, type);

  const { filters, update, reset, query: filterQuery, advancedCount, activeCount } = useMediaFilters(type);
  // Every request carries the key, so the server applies its scope.
  const query = keyId ? `${filterQuery}&key=${encodeURIComponent(keyId)}` : filterQuery;
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
        aiCategories={aiCategories}
        activeCount={activeCount}
        advancedCount={advancedCount}
        total={total}
      />

      <div className={classes.content}>
        {view && <KeyViewBanner view={view} type={type} canLeave={!keyLocked} />}
        {keyInfo.error && <Alert color="red" mb="md" title="Proyek tidak bisa dimuat">{keyInfo.error}</Alert>}
        {blocked ? (
          <div className={keyViewClasses.blocked}>
            <b>Proyek ini tidak punya akses ke {type === "social" ? "media sosial" : "media online"}</b>
            <span>Pilih jenis media lain di banner di atas.</span>
          </div>
        ) : (<>
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
          view={viewMode}
          onViewChange={changeView}
          busy={feed.loading}
        />

        <ActiveFilters filters={filters} options={options.data} onChange={update} />

        {feed.error && (
          <Alert color="red" mb="md" title="Gagal memuat">
            {feed.error} <Button size="xs" variant="light" color="red" ml="sm" onClick={feed.retry}>Coba lagi</Button>
          </Alert>
        )}

        <Masonry view={viewMode}>
          {[
            ...feed.items.map((item, i) => <ItemCard key={item.code} item={item} type={type} delay={(i % PAGE_SIZE) * CARD_STAGGER_MS} onOpen={setSelected} />),
            ...(feed.loading
              ? Array.from({ length: feed.items.length ? 4 : 12 }, (_, i) => <Skeleton key={`skeleton-${i}`} h={SKELETON_HEIGHTS[i % SKELETON_HEIGHTS.length]} radius={18} />)
              : []),
          ]}
        </Masonry>

        {feed.loaded && !feed.items.length && !feed.loading && (
          <div className={classes.emptyState}><b>Tidak ada hasil yang cocok</b><p>Coba kata pencarian lain atau hapus sebagian filter di atas.</p><Button variant="light" onClick={reset}>Kembalikan filter awal</Button><Button variant="subtle" onClick={() => update({ analyzed: "", relevance: "", search: "", from: "", to: "", mood: null, source: null, province: null, category: null, language: "", postType: "", minLevel: "", withImage: false, aiCategory: null })}>Lihat semua dalam cakupan ini</Button></div>
        )}
        <div ref={sentinel} />
        {feed.loading && feed.items.length > 0 && <Group justify="center" py="lg"><Loader type="dots" color="violet" /></Group>}
        {feed.loaded && !feed.hasMore && feed.items.length > 0 && <Text ta="center" fz={12.5} c="dimmed" py="xl">Semua data sudah ditampilkan.</Text>}

        </>)}

        <ScrollTopButton />
        <ItemDetailModal item={selected} type={type} keyName={view?.name} onClose={() => setSelected(null)}
          correction={view && aiCategories ? { keyId: view.id, categories: aiCategories, onSaved: (code, classification) => {
            // The card shares this object with the feed, so updating it in place refreshes both.
            const target = feed.items.find((i) => i.code === code);
            if (target) target.classification = classification;
            setSelected((s) => (s && s.code === code ? { ...s, classification } : s));
          } } : undefined} />
      </div>
    </div>
  );
}
