"use client";
import { categoriesForType } from "@/lib/ai/classifier";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Text } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import type { Category } from "@/lib/ai/classifier";
import { allowsType, type KeyScope } from "@/lib/media/keyScope";
import type { FilterOptions, MediaItem, MediaType, MoodCount } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import { ActiveFilters } from "./ActiveFilters";
import { AdvancedFilters } from "./AdvancedFilters";
import { CardSkeleton, MAX_COLUMNS, SkeletonGrid } from "./CardSkeleton";
import { ItemCard } from "./ItemCard";
import { OriginalCard } from "./OriginalCard";
import { ItemDetailModal } from "./ItemDetailModal";
import { KeyViewBanner, type KeyView } from "./KeyViewBanner";
import { ManualLabelContext } from "./ManualLabel";
import type { LabelSettings } from "@/lib/media/manualLabels";
import { Masonry } from "./Masonry";
import { QuickFilters } from "./QuickFilters";
import { StatsBar } from "./StatsBar";
import { useInfiniteScroll, useMediaFeed } from "./useMediaFeed";
import { SOURCE_KEY, useCleanMediaUrl, useMediaFilters } from "./useMediaFilters";
import classes from "./browser.module.css";
import keyViewClasses from "./keyView.module.css";

type KeyResponse = { key: { id: string; name: string; scope: KeyScope }; classifier: { enabled: boolean; categories: Category[]; onlineCategories: Category[] | null } | null };

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
export function MediaBrowser(props: { type: MediaType; keyLocked?: boolean }) {
  const ready = useCleanMediaUrl(props.type);
  const projectId = useSearchParams().get("key") ?? "";
  if (!ready) return null;
  // Remounted per project, so nothing loaded for one project (banner, labels, AI categories, open post) carries over.
  return <ProjectBrowser key={projectId} {...props} />;
}

function ProjectBrowser({ type, keyLocked = false }: { type: MediaType; keyLocked?: boolean }) {
  const searchParams = useSearchParams();
  const keyId = searchParams.get("key");
  // Quick View (the card as before) or Original View (the post as its platform shows it); the choice is remembered in this browser.
  const [original, setOriginal] = useState(true); // Original View unless the user chose Quick
  useEffect(() => {
    try { setOriginal(localStorage.getItem(SOURCE_KEY) !== "quick"); } catch { /* storage unavailable */ }
  }, []);
  const changeSource = (source: "quick" | "asli") => {
    setOriginal(source === "asli");
    try { localStorage.setItem(SOURCE_KEY, source); } catch { /* ignore */ }
  };
  const originalView = type === "social" && original;
  const keyInfo = useApi<KeyResponse>(keyId ? `/api/admin/keys/${keyId}/classifier` : null);
  const view: KeyView | null = keyInfo.data
    ? { id: keyInfo.data.key.id, name: keyInfo.data.key.name, scope: keyInfo.data.key.scope, aiEnabled: !!keyInfo.data.classifier?.enabled }
    : null;
  // Manual labels of the project (separate from AI categorisation): the dropdown on each card.
  const labelSettings = useApi<LabelSettings>(keyId ? `/api/admin/keys/${keyId}/labels` : null);
  const [, setLabelVersion] = useState(0);
  const labelContext = keyId && labelSettings.data ? { keyId, type, options: labelSettings.data.options, canLabel: labelSettings.data.canLabel, onLabelled: (code: string, labels: string[]) => {
    // The modal may hold a copy of the item (after an AI correction): update the feed's own object too, then re-render.
    const target = feed.items.find((i) => i.code === code);
    if (target) target.manualLabels = labels;
    setLabelVersion((v) => v + 1);
  } } : null;
  const aiCategories = keyInfo.data?.classifier ? (categoriesForType(keyInfo.data.classifier, type) as Category[]) : null;
  const blocked = !!view && !allowsType(view.scope, type);

  const { filters, update, reset, query, advancedCount, activeCount } = useMediaFilters(type);
  const feed = useMediaFeed(type, query);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);

  const options = useApi<FilterOptions>(`/api/admin/media/${type}?view=options`);
  // Active projects that cover this media type; the list is already limited to the account's own projects for users.
  const keyList = useApi<{ id: string; name: string; scope: KeyScope; revokedAt: string | null }[]>("/api/admin/keys");
  const projects = useMemo(() => (keyList.data ?? []).filter((k) => !k.revokedAt && allowsType(k.scope, type)).map((k) => ({ value: k.id, label: k.name })), [keyList.data, type]);
  // The exact total is slow on large sets, so it loads on its own; sort doesn't change it.
  const countQuery = new URLSearchParams(query);
  countQuery.delete("sort");
  const count = useApi<{ total: number }>(`/api/admin/media/${type}?view=count&${countQuery}`);
  // The mood bar loads on its own too (slow on broad scopes), so the posts never wait for it; it ignores the mood filter.
  const moodQuery = new URLSearchParams(countQuery);
  moodQuery.delete("mood");
  const moods = useApi<{ moods: MoodCount[] }>(`/api/admin/media/${type}?view=moods&${moodQuery}`);
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
        options={options.data}
        projects={projects}
        keyLocked={keyLocked}
        aiCategories={aiCategories}
        manualLabels={labelSettings.data?.options ?? null}
        activeCount={activeCount}
        advancedCount={advancedCount}
        total={total}
      />

      <ManualLabelContext.Provider value={labelContext}>
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
          moods={moods.data?.moods ?? null}
          busy={feed.loading}
          onMoodChange={(mood) => update({ mood })}
        />
        <QuickFilters
          type={type}
          filters={filters}
          onChange={update}
          advancedCount={advancedCount}
          advancedOpen={drawerOpen}
          onToggleAdvanced={() => setDrawerOpen((open) => !open)}
          source={original ? "asli" : "quick"}
          onSourceChange={changeSource}
          busy={feed.loading}
        />

        <ActiveFilters filters={filters} options={options.data} onChange={update} onReset={reset} canReset={activeCount > 0} />

        {feed.error && (
          <Alert color="red" mb="md" title="Gagal memuat">
            {feed.error} <Button size="xs" variant="light" color="red" ml="sm" onClick={feed.retry}>Coba lagi</Button>
          </Alert>
        )}

        {/* First load: a full grid of card-shaped placeholders. Next pages: one placeholder under each column. */}
        {feed.loading && !feed.items.length ? <SkeletonGrid type={type} /> : (
          <Masonry>
            {[
              ...feed.items.map((item, i) => {
                const Card = originalView ? OriginalCard : ItemCard;
                return <Card key={item.code} item={item} type={type} delay={(i % PAGE_SIZE) * CARD_STAGGER_MS} onOpen={setSelected} />;
              }),
              ...(feed.loading ? Array.from({ length: MAX_COLUMNS }, (_, i) => <CardSkeleton key={`skeleton-${i}`} index={feed.items.length + i} type={type} />) : []),
            ]}
          </Masonry>
        )}

        {feed.loaded && !feed.items.length && !feed.loading && (
          <div className={classes.emptyState}><b>Tidak ada hasil yang cocok</b><p>Coba kata pencarian lain atau hapus sebagian filter di atas.</p><Button variant="light" onClick={reset}>Kembalikan filter awal</Button><Button variant="subtle" onClick={() => update({ analyzed: "", relevance: "", search: "", from: "", to: "", mood: null, source: null, province: null, category: null, language: "", postType: "", minLevel: "", withImage: false, aiCategory: null, manualLabel: null })}>Lihat semua dalam cakupan ini</Button></div>
        )}
        <div ref={sentinel} />
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
      </ManualLabelContext.Provider>
    </div>
  );
}
