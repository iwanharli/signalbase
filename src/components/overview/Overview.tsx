"use client";
import { KeywordsPill } from "./KeywordsPill";
import type { Role } from "@/lib/session";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert, Skeleton } from "@mantine/core";
import { IconArrowRight, IconMail, IconEdit, IconKey, IconMessages, IconPlugConnected, IconSearch, IconWorldWww } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import type { InsightPeriod } from "@/lib/media/insights";
import { sourceLabel } from "@/lib/media/labels";
import { moodInfo } from "@/lib/media/mood";
import type { MediaItem, MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import classes from "./overview.module.css";
import { AiSummary } from "./AiSummary";
import { CardHelp } from "./CardHelp";
import { FilterControls, Insights, Kpis, useInsights, VIEW_LABEL, type View } from "./Insights";

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

/** Keeps only the items that fit whole in the box (as tall as the card beside it): no cut text, no empty space. */
function useFitItems(count: number) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(count);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const limit = el.clientHeight;
      const rows = [...el.children] as HTMLElement[];
      let n = 0;
      for (const row of rows) { if (row.offsetTop + row.offsetHeight <= limit + 1) n++; else break; }
      setFit(Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);
  return { box, fit };
}

/** Newest items of one media type. fill: as tall as the card beside it, showing as many whole items as fit. */
function LatestFeed({ type, items, keyQuery, scoped, fill }: { type: MediaType; items: MediaItem[] | null; keyQuery: string; scoped: boolean; fill?: boolean }) {
  const f = FEED[type];
  const Icon = TYPE_ICON[type];
  const { box, fit } = useFitItems(items?.length ?? 0);
  return (
    <section className={classes.panel} data-fill={fill || undefined}>
      <header className={classes.panelHead}>
        <div><h3>{f.title}<CardHelp id={type === "social" ? "latestSocial" : "latestOnline"} /></h3><p>{scoped ? `${f.what} terbaru yang menyebut keyword proyek ini` : `${f.what} paling baru yang masuk ke bank`}</p></div>
        <Link href={`/media/${type}${keyQuery}`} className={classes.more}>Lihat semua <IconArrowRight size={14} /></Link>
      </header>
      <div className={classes.feedWrap}>
      <div className={classes.feed} ref={fill ? box : undefined}>
        {!items && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={58} radius="md" />)}
        {items?.map((item, i) => {
          const mood = item.mood ? moodInfo(item.mood) : null;
          return (
            <Link key={item.code} href={`/media/${type}${keyQuery}${keyQuery ? "&" : "?"}item=${encodeURIComponent(item.code)}`} className={classes.feedItem}
              data-hidden={(fill && i >= fit) || undefined} style={{ animationDelay: `${i * 60}ms` }}>
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
      </div>
    </section>
  );
}

/** A client with no project yet: the admin sets projects and keywords up (from the topics given at sign-up). */
function Onboarding({ name }: { name: string }) {
  const steps = [
    { icon: IconKey, title: "Admin menyiapkan proyek", text: "Tim Signalbase membuat proyek dan keyword sesuai topik yang Anda sampaikan saat mendaftar." },
    { icon: IconSearch, title: "Lihat sinyalnya", text: "Beranda dan halaman media menampilkan post dan berita yang menyebut keyword itu." },
    { icon: IconPlugConnected, title: "Pantau dan laporkan", text: "Ikuti isu, peringatan dini, dan unduh laporan dari menu Laporan." },
  ];
  return (
    <section className={classes.onboard}>
      <span className={classes.live}><i />Selamat datang, {name}</span>
      <h1>Proyek Anda sedang <em>disiapkan</em>.</h1>
      <p>Beranda masih kosong karena belum ada proyek untuk akun ini. Begitu admin memberikannya, data langsung muncul di sini.</p>
      <ol>{steps.map((s, i) => <li key={s.title} style={{ animationDelay: `${i * 90}ms` }}><span><s.icon size={20} /></span><b>{i + 1}. {s.title}</b><small>{s.text}</small></li>)}</ol>
      <div className={classes.onboardActions}>
        <Link href="/kontak" className={classes.primaryLink}><IconMail size={16} />Hubungi admin Signalbase</Link>
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
              <div className={classes.heroPills}>
                <span className={classes.live}><i />{own ? "Beranda" : "Dilihat sebagai proyek"} · {key.name}</span>
                <KeywordsPill name={key.name} keywords={key.keywords} data={insights.data} period={period} scope={scope} />
              </div>
              <h1>Sinyal untuk <em>keyword {own ? "Anda" : "proyek ini"}</em></h1>
              {/* The project's keywords are an admin's business: clients don't see them, only admins edit them. */}
              {!own && <div className={classes.heroKw}>{key.keywords.map((w) => <span key={w}>{w}</span>)}
                {role === "admin" && <Link href={`/project/${key.id}`} className={classes.heroEdit}><IconEdit size={13} />Ubah</Link>}</div>}
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

      {data && <Insights keyId={key?.id ?? null} view={view} period={period} data={insights.data} error={insights.error} wanted={insights.wanted} projects={data.keys}
        latest={(hasSocial || hasOnline) && (
          <div className={classes.two} data-single={!both || undefined}>
            {hasSocial && <LatestFeed type="social" items={data.social!.latest} keyQuery={keyQuery} scoped={!!key} />}
            {hasOnline && <LatestFeed type="online" items={data.online!.latest} keyQuery={keyQuery} scoped={!!key} fill={both} />}
          </div>
        )} />}
    </div>
  );
}
