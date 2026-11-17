"use client";
import type { Role } from "@/lib/session";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert, Skeleton } from "@mantine/core";
import { IconArrowRight, IconBook2, IconEdit, IconKey, IconMessages, IconPlugConnected, IconSearch, IconWorldWww } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import type { InsightPeriod } from "@/lib/media/insights";
import { sourceLabel } from "@/lib/media/labels";
import { moodInfo } from "@/lib/media/mood";
import type { MediaItem, MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import classes from "./overview.module.css";
import { AiSummary } from "./overview/AiSummary";
import { FilterControls, Insights, Kpis, useInsights, VIEW_LABEL, type View } from "./overview/Insights";

dayjs.extend(relativeTime);

type TypeStats = { latest: MediaItem[] };
type ApiKeySummary = { id: string; name: string; keywords: string[]; lastUsedAt: string | null };
/** A type is null when the viewed key's scope leaves it out. noKey: a user account without any key yet. */
type OverviewStats = { social: TypeStats | null; online: TypeStats | null; key: { id: string; name: string; keywords: string[] } | null; keys: ApiKeySummary[]; at: string; noKey?: boolean };

/** The sticky filter bar shows once the hero's filters scroll under the floating nav (60px bar + 14px gap + margin). */
const NAV_CLEARANCE = 90;

const TYPE_ICON = { social: IconMessages, online: IconWorldWww } as const;

const FEED = {
  social: { title: "Sinyal Terbaru Sosial Media", what: "Post", empty: "Belum ada post yang menyebut keyword ini." },
  online: { title: "Sinyal Terbaru Media Online", what: "Berita", empty: "Belum ada berita yang menyebut keyword ini." },
} as const;

/** Newest items of one media type. */
function LatestFeed({ type, items, keyQuery, scoped }: { type: MediaType; items: MediaItem[] | null; keyQuery: string; scoped: boolean }) {
  const f = FEED[type];
  const Icon = TYPE_ICON[type];
  return (
    <section className={classes.panel}>
      <header className={classes.panelHead}>
        <div><h3>{f.title}</h3><p>{scoped ? `${f.what} terbaru yang menyebut keyword proyek ini` : `${f.what} paling baru yang masuk ke bank`}</p></div>
        <Link href={`/media/${type}${keyQuery}`} className={classes.more}>Lihat semua <IconArrowRight size={14} /></Link>
      </header>
      <div className={classes.feed}>
        {!items && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={58} radius="md" />)}
        {items?.map((item, i) => {
          const mood = item.mood ? moodInfo(item.mood) : null;
          return (
            <Link key={item.code} href={`/media/${type}${keyQuery}`} className={classes.feedItem} style={{ animationDelay: `${i * 60}ms` }}>
              <span className={classes.feedIcon} data-t={type}><Icon size={16} /></span>
              <span className={classes.feedBody}>
                <span className={classes.feedText}>{item.title ?? item.content}</span>
                <span className={classes.feedMeta}>
                  {sourceLabel(item.source)} · {dayjs(item.publishedAt).locale("id").fromNow()}
                  {mood && <em style={{ color: `var(--mantine-color-${mood.color}-6)` }}> · {mood.label}</em>}
                </span>
              </span>
            </Link>
          );
        })}
        {items && !items.length && <p className={classes.empty}>{f.empty}</p>}
      </div>
    </section>
  );
}

/** A user account without any key: nothing to show until they choose keywords. */
function Onboarding({ name }: { name: string }) {
  const steps = [
    { icon: IconKey, title: "Buat proyek", text: "Beri nama aplikasi Anda dan tentukan keyword yang ingin dipantau." },
    { icon: IconSearch, title: "Lihat sinyalnya", text: "Beranda dan halaman media menampilkan post dan berita yang menyebut keyword itu." },
    { icon: IconPlugConnected, title: "Hubungkan aplikasi", text: "Ambil data yang sama lewat API dengan kunci API proyek tersebut." },
  ];
  return (
    <section className={classes.onboard}>
      <span className={classes.live}><i />Selamat datang, {name}</span>
      <h1>Mulai dengan <em>keyword</em> Anda.</h1>
      <p>Beranda masih kosong karena belum ada proyek. Data hanya muncul untuk keyword yang Anda pilih.</p>
      <ol>{steps.map((s, i) => <li key={s.title} style={{ animationDelay: `${i * 90}ms` }}><span><s.icon size={20} /></span><b>{i + 1}. {s.title}</b><small>{s.text}</small></li>)}</ol>
      <div className={classes.onboardActions}>
        <Link href="/api-keys/new" className={classes.primaryLink}><IconKey size={16} />Buat proyek & atur keyword</Link>
        <Link href="/docs" className={classes.more}><IconBook2 size={14} />Baca dokumentasi API</Link>
      </div>
    </section>
  );
}

export function Overview({ name, role }: { name: string; role: Role }) {
  const keyId = useSearchParams().get("key");
  const { data, error } = useApi<OverviewStats>(`/api/admin/stats${keyId ? `?key=${encodeURIComponent(keyId)}` : ""}`);
  const [chosenView, setView] = useState<View>("all");
  const [period, setPeriod] = useState<InsightPeriod>(7);
  const hasSocial = !!data && data.social !== null, hasOnline = !!data && data.online !== null;
  const both = hasSocial && hasOnline;
  const view: View = both ? chosenView : hasOnline && !hasSocial ? "online" : "social";
  const key = data?.key ?? null;
  const insights = useInsights(key?.id ?? null, hasSocial, hasOnline, view, period);

  // Show the compact filter bar while the hero's own filters are scrolled out of sight.
  const heroRef = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: `-${NAV_CLEARANCE}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [data?.noKey]);

  if (data?.noKey) return <div className={classes.page}><Onboarding name={name} /></div>;
  const keyQuery = key ? `?key=${key.id}` : "";
  const own = role === "user";
  const filters = <FilterControls view={view} onView={setView} period={period} onPeriod={setPeriod} both={both} />;
  const at = insights.data?.at ?? data?.at;
  const scope = `${period} hari terakhir · ${VIEW_LABEL[view].toLowerCase()}${at ? ` · diperbarui ${dayjs(at).format("HH:mm")}` : ""}`;

  return (
    <div className={classes.page}>
      <section className={classes.hero} ref={heroRef}>
        <div className={classes.heroGrid} aria-hidden />
        <div className={classes.heroTop}>
          <div className={classes.heroText}>
            {key ? <>
              <span className={classes.live}><i />{own ? "Beranda" : "Dilihat sebagai proyek"} · {key.name}</span>
              <h1>Sinyal untuk <em>keyword {own ? "Anda" : "proyek ini"}</em></h1>
              <div className={classes.heroKw}>{key.keywords.map((w) => <span key={w}>{w}</span>)}
                <Link href={`/api-keys/${key.id}`} className={classes.heroEdit}><IconEdit size={13} />Ubah</Link></div>
            </> : <>
              {/* The date waits for the client data, so a server in another time zone can't render a different day. */}
              <span className={classes.live}><i />{data ? dayjs().locale("id").format("dddd, D MMMM YYYY") : "Ringkasan"}</span>
              <h1>Ringkasan <em>bank data</em></h1>
            </>}
            <p>{scope}</p>
          </div>
          {data ? filters : <Skeleton h={40} w={320} radius="md" opacity={0.15} />}
        </div>
        <Kpis data={insights.data} period={period} keyId={key?.id ?? null} view={view} />
      </section>

      <div className={classes.sticky} data-show={stuck || undefined} aria-hidden={!stuck}>
        <span>{scope}</span>
        {data && filters}
      </div>

      {error && <Alert color="red" mb="lg">{error}</Alert>}

      {data && <AiSummary keyId={key?.id ?? null} admin={role === "admin"} />}

      {data && <Insights keyId={key?.id ?? null} view={view} period={period} data={insights.data} error={insights.error} wanted={insights.wanted} projects={data.keys} />}

      {data && (hasSocial || hasOnline) && (
        <div className={classes.two} data-single={!both || undefined}>
          {hasSocial && <LatestFeed type="social" items={data.social!.latest} keyQuery={keyQuery} scoped={!!key} />}
          {hasOnline && <LatestFeed type="online" items={data.online!.latest} keyQuery={keyQuery} scoped={!!key} />}
        </div>
      )}
    </div>
  );
}
