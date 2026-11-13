"use client";
import type { Role } from "@/lib/session";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert, Skeleton } from "@mantine/core";
import { IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconBook2, IconEdit, IconKey, IconMessages, IconPlugConnected, IconSearch, IconWorldWww } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { formatNumber, MEDIA_TYPE_LABEL, MOOD_KIND_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodColorVar, moodInfo } from "@/lib/media/mood";
import type { DailyCount, MediaItem, MediaType, MoodCount } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import classes from "./overview.module.css";
import { AiSummary } from "./overview/AiSummary";
import { Insights } from "./overview/Insights";
import { Tip } from "./ui/Tip";

dayjs.extend(relativeTime);

type TypeStats = { daily: DailyCount[]; moods: MoodCount[]; latest: MediaItem[] };
type ApiKeySummary = { id: string; name: string; keywords: string[]; lastUsedAt: string | null };
/** A type is null when the viewed key's scope leaves it out. noKey: a user account without any key yet. */
type OverviewStats = { social: TypeStats | null; online: TypeStats | null; key: { id: string; name: string; keywords: string[] } | null; keys: ApiKeySummary[]; at: string; noKey?: boolean };

const CHART_DAYS = 14;
const LEGEND_SIZE = 6;
const RECENTLY_USED_MS = 60 * 60_000;
const COUNT_UP_MS = 1100;

const TYPE_STYLE = {
  social: { icon: IconMessages, from: "#7c3aed", to: "#c084fc" },
  online: { icon: IconWorldWww, from: "#0891b2", to: "#22d3ee" },
} as const;
const KEYS_STYLE = { from: "#059669", to: "#34d399" };

const gradientVars = (style: { from: string; to: string }) => ({ ["--c1" as string]: style.from, ["--c2" as string]: style.to });
const sum = (counts: { n: number }[]) => counts.reduce((total, c) => total + c.n, 0);

/** The last CHART_DAYS days, oldest first, with missing days filled with 0. */
function fillDays(daily: DailyCount[]): DailyCount[] {
  const byDay = new Map(daily.map((d) => [d.day, d.n]));
  return Array.from({ length: CHART_DAYS }, (_, i) => {
    const day = dayjs().subtract(CHART_DAYS - 1 - i, "day").format("YYYY-MM-DD");
    return { day, n: byDay.get(day) ?? 0 };
  });
}

/** Number that counts up from 0 with an ease-out curve. */
function CountUp({ value }: { value: number }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setCurrent(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      setCurrent(value * (1 - Math.pow(1 - progress, 4)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{formatNumber(current)}</>;
}

/** Hero tile: this week's volume and the change from the week before. */
function VolumeTile({ type, stats, keyQuery }: { type: MediaType; stats?: TypeStats | null; keyQuery: string }) {
  const style = TYPE_STYLE[type];
  const days = stats ? fillDays(stats.daily) : [];
  const thisWeek = sum(days.slice(7));
  const lastWeek = sum(days.slice(0, 7));
  const change = lastWeek ? ((thisWeek - lastWeek) / lastWeek) * 100 : 0;
  return (
    <Link href={`/media/${type}${keyQuery}`} className={classes.tile} style={gradientVars(style)} data-off={stats === null || undefined}>
      <span className={classes.tileIcon}><style.icon size={20} /></span>
      <span className={classes.tileLabel}>{MEDIA_TYPE_LABEL[type]} · 7 hari</span>
      <b className={classes.tileValue}>{stats ? <CountUp value={thisWeek} /> : "—"}</b>
      {stats === null && <span className={classes.delta}>Tidak termasuk cakupan proyek</span>}
      {stats && lastWeek > 0 && (
        <span className={classes.delta} data-down={change < 0 || undefined}>
          {change < 0 ? <IconArrowDownRight size={14} /> : <IconArrowUpRight size={14} />}{Math.abs(change).toFixed(1)}% vs 7 hari sebelumnya
        </span>
      )}
    </Link>
  );
}

/** Daily volume bars plus the week's mood breakdown for one media type. */
function TypePanel({ type, stats, keyQuery }: { type: MediaType; stats?: TypeStats | null; keyQuery: string }) {
  const days = stats ? fillDays(stats.daily) : [];
  const peak = Math.max(1, ...days.map((d) => d.n));
  const moodTotal = sum(stats?.moods ?? []);
  return (
    <section className={classes.panel} style={gradientVars(TYPE_STYLE[type])}>
      <header className={classes.panelHead}>
        <div><h3>{MEDIA_TYPE_LABEL[type]}</h3><p>Volume harian, 14 hari terakhir · hari ini belum lengkap</p></div>
        {stats !== null && <Link href={`/media/${type}${keyQuery}`} className={classes.more}>Jelajahi <IconArrowRight size={14} /></Link>}
      </header>

      {stats === null ? <p className={classes.empty}>Jenis media ini tidak termasuk cakupan proyek. Ubah cakupan di halaman Proyek untuk menampilkannya.</p> : !stats ? <Skeleton h={170} radius="md" /> : (
        <div className={classes.chart}>
          {days.map((d, i) => (
            <div key={d.day} className={classes.col} tabIndex={0} aria-label={`${dayjs(d.day).locale("id").format("D MMMM YYYY")}: ${formatNumber(d.n)} item${i === CHART_DAYS - 1 ? ", hari ini belum lengkap" : ""}`} data-today={i === CHART_DAYS - 1 || undefined}>
              <span className={classes.tip}>{dayjs(d.day).locale("id").format("D MMM")}<b>{formatNumber(d.n)}</b></span>
              <i style={{ height: `${d.n === 0 ? 0 : Math.max(2, (d.n / peak) * 100)}%`, animationDelay: `${i * 35}ms` }} />
              <small>{dayjs(d.day).format("D")}</small>
            </div>
          ))}
        </div>
      )}

      {stats !== null && <div className={classes.moodHead}>{MOOD_KIND_LABEL[type]} · 7 hari</div>}
      {stats === null ? null : !stats ? <Skeleton h={40} radius="md" /> : moodTotal === 0 ? <p className={classes.empty}>Belum ada data teranalisis.</p> : (
        <>
          <div className={classes.spectrum}>
            {stats.moods.map((m) => <Tip key={m.value} label={`${moodInfo(m.value).label}: ${formatNumber(m.n)}`}><i style={{ flexGrow: m.n, background: moodColorVar(m.value) }} /></Tip>)}
          </div>
          <div className={classes.legend}>
            {stats.moods.slice(0, LEGEND_SIZE).map((m) => (
              <Link key={m.value} href={`/media/${type}${keyQuery ? `${keyQuery}&` : "?"}mood=${encodeURIComponent(m.value)}`}>
                <i style={{ background: moodColorVar(m.value) }} />{moodInfo(m.value).label}<b>{Math.round((m.n / moodTotal) * 100)}%</b>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Newest items of both types, merged by time. */
function LatestFeed({ stats, keyQuery, scoped }: { stats: OverviewStats | null; keyQuery: string; scoped: boolean }) {
  const items = stats
    ? [...(stats.social?.latest ?? []).map((item) => ({ item, type: "social" as const })), ...(stats.online?.latest ?? []).map((item) => ({ item, type: "online" as const }))]
      .sort((a, b) => b.item.publishedAt.localeCompare(a.item.publishedAt))
    : [];
  return (
    <section className={classes.panel}>
      <header className={classes.panelHead}><div><h3>Sinyal terbaru</h3><p>{scoped ? "Post dan berita terbaru yang menyebut keyword proyek ini" : "Data paling baru yang masuk ke bank"}</p></div></header>
      <div className={classes.feed}>
        {!stats && Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={58} radius="md" />)}
        {items.map(({ item, type }, i) => {
          const mood = item.mood ? moodInfo(item.mood) : null;
          const Icon = TYPE_STYLE[type].icon;
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
        {stats && !items.length && <p className={classes.empty}>Belum ada post atau berita yang menyebut keyword ini.</p>}
      </div>
    </section>
  );
}

function ConnectedApps({ keys, own, activeId }: { keys: ApiKeySummary[] | null; own: boolean; activeId?: string }) {
  return (
    <section className={classes.panel}>
      <header className={classes.panelHead}>
        <div><h3>{own ? "Proyek Anda" : "Aplikasi terhubung"}</h3><p>{own ? "Pilih proyek untuk melihat datanya di beranda" : "Proyek aktif dan cakupannya"}</p></div>
        <Link href="/api-keys" className={classes.more}>Kelola <IconArrowRight size={14} /></Link>
      </header>
      <div className={classes.keys}>
        {!keys && <Skeleton h={120} radius="md" />}
        {keys?.map((key) => {
          const recentlyUsed = !!key.lastUsedAt && Date.now() - new Date(key.lastUsedAt).getTime() < RECENTLY_USED_MS;
          return (
            <Link key={key.id} href={`/dashboard?key=${key.id}`} className={classes.key} data-active={key.id === activeId || undefined}>
              <span className={classes.keyIcon} data-fresh={recentlyUsed || undefined}><IconPlugConnected size={17} /></span>
              <div>
                <b>{key.name}</b>
                <small>{key.lastUsedAt ? `Terakhir dipakai ${dayjs(key.lastUsedAt).locale("id").fromNow()}` : "Belum pernah dipakai"}</small>
                <div className={classes.kw}>{key.keywords.length ? key.keywords.map((w) => <span key={w}>{w}</span>) : <span>semua data</span>}</div>
              </div>
            </Link>
          );
        })}
        {keys && !keys.length && <p className={classes.empty}>Belum ada proyek aktif.</p>}
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
  if (data?.noKey) return <div className={classes.page}><Onboarding name={name} /></div>;
  const key = data?.key ?? null;
  const keyQuery = key ? `?key=${key.id}` : "";
  const own = role === "user";
  return (
    <div className={classes.page}>
      <section className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <div className={classes.heroText}>
          {key ? <>
            <span className={classes.live}><i />{own ? "Beranda" : "Dilihat sebagai proyek"} · {key.name}</span>
            <h1>Sinyal untuk <em>keyword {own ? "Anda" : "proyek ini"}</em></h1>
            <div className={classes.heroKw}>{key.keywords.map((w) => <span key={w}>{w}</span>)}
              <Link href={`/api-keys/${key.id}`} className={classes.heroEdit}><IconEdit size={13} />Ubah</Link></div>
            {data && <p>Diperbarui {dayjs(data.at).locale("id").format("HH:mm")}.</p>}
          </> : <>
            <span className={classes.live}>Ringkasan bank data</span>
            <h1>Pusat <em>Sinyal</em> Media</h1>
            <p>Arus post media sosial dan berita online yang dibuka untuk aplikasi lain lewat kunci API.{data && <> Diperbarui {dayjs(data.at).locale("id").format("HH:mm")}.</>}</p>
          </>}
        </div>
        <div className={classes.tiles}>
          <VolumeTile type="social" stats={data ? data.social : undefined} keyQuery={keyQuery} />
          <VolumeTile type="online" stats={data ? data.online : undefined} keyQuery={keyQuery} />
          <Link href="/api-keys" className={classes.tile} style={gradientVars(KEYS_STYLE)}>
            <span className={classes.tileIcon}><IconKey size={20} /></span>
            <span className={classes.tileLabel}>{own ? "Proyek Anda" : "Proyek aktif"}</span>
            <b className={classes.tileValue}>{data ? <CountUp value={data.keys.length} /> : "—"}</b>
            <span className={classes.delta}>{own ? "Kelola proyek & keyword" : "Aplikasi terhubung"}</span>
          </Link>
        </div>
      </section>

      {error && <Alert color="red" mb="lg">{error}</Alert>}

      {data && <AiSummary keyId={key?.id ?? null} admin={role === "admin"} />}

      {data && <Insights keyId={key?.id ?? null} social={data.social !== null} online={data.online !== null} projects={data.keys} />}

      <div className={classes.two}>
        <TypePanel type="social" stats={data ? data.social : undefined} keyQuery={keyQuery} />
        <TypePanel type="online" stats={data ? data.online : undefined} keyQuery={keyQuery} />
      </div>

      {/* Viewing a project: its keywords and the other projects sit in the "Proyek & keyword" card above. */}
      {key ? <LatestFeed stats={data ?? null} keyQuery={keyQuery} scoped /> : (
        <div className={classes.two} data-wide-left>
          <LatestFeed stats={data ?? null} keyQuery={keyQuery} scoped={false} />
          <ConnectedApps keys={data?.keys ?? null} own={own} activeId={undefined} />
        </div>
      )}
    </div>
  );
}
