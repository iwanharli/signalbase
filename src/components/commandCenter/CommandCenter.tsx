"use client";
import type { Role } from "@/lib/session";
// One-screen summary of Ringkasan: round charts only, no scrolling on a normal desktop viewport.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@mantine/core";
import type { LucideIcon } from "lucide-react";
import { Activity, ChartLine, LayoutDashboard, Flame, Hash, Maximize2, Minimize2, MessagesSquare, Newspaper, Siren, Smile, KeyRound, UserRound, Zap } from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { changePct, ratioFill } from "@/lib/commandCenter";
import { type Insights, type InsightPeriod } from "@/lib/media/insights";
import { formatNumber } from "@/lib/media/labels";
import { moodColorVar, moodInfo } from "@/lib/media/mood";
import type { DailyCount, MoodCount } from "@/lib/media/types";
import { type IssueSummary } from "@/lib/issues";
import { useApi } from "@/lib/useApi";
import { Segmented } from "../media/controls";
import controlClasses from "../media/controls.module.css";
import { LogoMark } from "../Logo";
import { Bars, Donut, Gauge, LineChart, TrendBars, type Slice } from "./charts";
import classes from "./commandCenter.module.css";

// Mapbox is heavy and needs the browser, so it loads only here and only on screens that have room for it.
const Globe = dynamic(() => import("./Globe"), { ssr: false });

type TypeStats = { daily: DailyCount[]; moods: MoodCount[] };
type Stats = { social: TypeStats | null; online: TypeStats | null; key: { id: string; name: string } | null; keys: { id: string; name: string }[]; at: string; noKey?: boolean };
const PERIODS = [7, 14, 30].map((d) => ({ value: String(d), label: `${d} hari` }));
const REFRESH_MS = 60_000;
const sum = (c: { n: number }[]) => c.reduce((t, x) => t + x.n, 0);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const signed = (v: number | null) => (v === null ? null : `${v >= 0 ? "+" : "-"}${Math.abs(Math.round(v))}%`);

const lastDays = (daily: DailyCount[] | undefined, count: number) => {
  const by = new Map((daily ?? []).map((d) => [d.day, d.n]));
  const days = Array.from({ length: count }, (_, i) => dayjs().subtract(count - 1 - i, "day"));
  return { labels: days.map((d) => d.locale("id").format("D MMM")), values: days.map((d) => by.get(d.format("YYYY-MM-DD")) ?? 0) };
};

function Panel({ title, icon: Icon, accent, children, className }: { title: string; icon: LucideIcon; accent: string; children: React.ReactNode; className?: string }) {
  return <section className={[classes.panel, className].filter(Boolean).join(" ")} style={{ ["--ac" as string]: accent }}><h2><span className={classes.badge}><Icon size={15} strokeWidth={2.2} /></span>{title}</h2><div className={classes.body}>{children}</div></section>;
}

export function CommandCenter({ role, mapToken }: { role: Role; mapToken: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const keyParam = params.get("key");
  const [days, setDays] = useState<InsightPeriod>(7);
  const [full, setFull] = useState(false);
  const [fit, setFit] = useState(false);
  const page = useRef<HTMLDivElement>(null);

  const stats = useApi<Stats>(`/api/admin/stats?days=${days}${keyParam ? `&key=${encodeURIComponent(keyParam)}` : ""}`);
  const ready = stats.data && !stats.data.noKey;
  const kid = stats.data?.key?.id ?? null;
  const q = (type: string) => (ready && stats.data && stats.data[type as "social" | "online"] ? `/api/admin/stats/insights?type=${type}&days=${days}${kid ? `&key=${encodeURIComponent(kid)}` : ""}` : null);
  const social = useApi<{ insights: Insights }>(q("social"));
  const online = useApi<{ insights: Insights }>(q("online"));
  const issues = useApi<{ issues: IssueSummary[] }>(ready && stats.data?.online && (role !== "user" || kid) ? `/api/admin/issues?days=${days}&topik=nasional${kid ? `&key=${encodeURIComponent(kid)}` : ""}` : null);

  const reloaders = useRef<(() => void)[]>([]);
  reloaders.current = [stats.reload, social.reload, online.reload, issues.reload].filter(Boolean) as (() => void)[];
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) reloaders.current.forEach((r) => r()); }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // Fit the page into the viewport (below the top bar and any banner) and stop the document from scrolling; small screens scroll normally.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px) and (min-height: 640px)");
    const apply = () => {
      const el = page.current;
      if (!mq.matches || !el) { setFit(false); document.documentElement.style.overflow = ""; return; }
      el.style.setProperty("--cc-h", `${Math.max(480, window.innerHeight - el.getBoundingClientRect().top - 12 + window.scrollY)}px`);
      setFit(true); document.documentElement.style.overflow = "hidden";
    };
    apply();
    mq.addEventListener("change", apply); window.addEventListener("resize", apply);
    return () => { mq.removeEventListener("change", apply); window.removeEventListener("resize", apply); document.documentElement.style.overflow = ""; };
  }, [stats.data?.noKey, full]);
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); };

  const s = stats.data, si = social.data?.insights ?? null, oi = online.data?.insights ?? null;
  const loaded = s !== null;
  const setKey = useCallback((v: string | null) => router.replace(v ? `/command-center?key=${v}` : "/command-center"), [router]);

    // Everything below follows the period: this period against the one right before it.
  const cur = [si?.current, oi?.current].filter((c): c is NonNullable<typeof c> => !!c), prev = [si?.previous, oi?.previous].filter((c): c is NonNullable<typeof c> => !!c);
  const add = (list: typeof cur) => list.reduce((t, c) => ({ total: t.total + c.total, labelled: t.labelled + c.labelled, pos: t.pos + c.pos, neg: t.neg + c.neg }), { total: 0, labelled: 0, pos: 0, neg: 0 });
  const now = add(cur), before = add(prev);
  const gauges = cur.length ? [
    { label: "Total post & berita", value: ratioFill(now.total, before.total), text: formatNumber(now.total), sub: `${days} hari lalu: ${formatNumber(before.total)}`, color: "#a78bfa" },
    { label: "Bernada negatif", value: now.labelled ? now.neg / now.labelled : 0, text: `${pct(now.neg, now.labelled)}%`, sub: `${days} hari lalu: ${pct(before.neg, before.labelled)}%`, color: "#fb7185" },
    { label: "Bernada positif", value: now.labelled ? now.pos / now.labelled : 0, text: `${pct(now.pos, now.labelled)}%`, sub: `${days} hari lalu: ${pct(before.pos, before.labelled)}%`, color: "#34d399" },
  ] : null;

  const delta = (i: Insights | null) => (i ? signed(changePct(i.current.total, i.previous.total)) : null);
  const sd = lastDays(s?.social?.daily, days), od = lastDays(s?.online?.daily, days);
  const slices = (moods: MoodCount[] | undefined): Slice[] => [...(moods ?? [])].sort((a, b) => b.n - a.n).map((m) => ({ label: moodInfo(m.value).label, value: m.n, color: moodColorVar(m.value, 5) }));
  const words = [...(si?.keywords ?? []), ...(si?.hashtags ?? []), ...(oi?.keywords ?? [])].sort((a, b) => b.n - a.n).slice(0, 4).map((r) => ({ label: r.value, value: r.n }));
  const topIssues = (issues.data?.issues ?? []).slice(0, 4).map((i) => ({ label: i.label || i.title, value: i.score, hint: formatNumber(i.score), onClick: () => router.push(`/isu?issue=${i.id}${kid ? `&key=${kid}` : ""}`) }));
  const accounts = (si?.accounts ?? []).slice(0, 4).map((a) => ({ label: a.name || `@${a.username}`, value: a.n }));
  const outlets = (oi?.media ?? []).slice(0, 4).map((m) => ({ label: m.source, value: m.n }));
  const trendByDay = new Map<string, { pos: number; neu: number; neg: number }>();
  for (const t of [...(si?.trend ?? []), ...(oi?.trend ?? [])]) {
    const d = trendByDay.get(t.day) ?? { pos: 0, neu: 0, neg: 0 };
    trendByDay.set(t.day, { pos: d.pos + t.pos, neu: d.neu + t.neu, neg: d.neg + t.neg });
  }
  const trend = [...trendByDay].sort(([x], [y]) => x.localeCompare(y)).map(([day, v]) => ({ label: dayjs(day).locale("id").format("D MMM"), ...v }));
  const alerts = [...(si?.alerts ?? []), ...(oi?.alerts ?? [])].map((a, i) => {
    if (a.kind === "spike") return { key: i, text: `Lonjakan "${a.label}": ${formatNumber(a.n)} (biasa ${formatNumber(Math.round(a.avg))}/hari)`, tone: "warn" };
    if (a.kind === "negative") return { key: i, text: `Sentimen negatif ${Math.round(a.share * 100)}% (biasa ${Math.round(a.avgShare * 100)}%)`, tone: "bad" };
    return { key: i, text: `${formatNumber(a.n)} post intens dalam 24 jam`, tone: "bad" };
  });

  if (s?.noKey) return (
    <div className={classes.page}><div className={classes.onboard}><KeyRound size={34} /><b>Command Center masih kosong</b><p>Buat proyek dan tentukan keyword agar ringkasan muncul di sini.</p><Link href="/api-keys/new">Buat proyek & atur keyword</Link></div></div>
  );

  const wait = !loaded || (!!q("social") && !social.data) || (!!q("online") && !online.data);
  const showGlobe = fit && !!mapToken;
  const none = <p className={classes.empty}>Di luar cakupan</p>;
  return (
    <div ref={page} className={classes.page} data-fit={fit || undefined} data-wait={wait || undefined}>
      <div className={classes.stage} aria-hidden>{showGlobe && <Globe token={mapToken} />}</div>
      <header className={classes.head}>
        <Link href="/dashboard" className={classes.brand} aria-label={role === "user" ? "Signalbase, kembali ke Beranda" : "Signalbase, kembali ke Ringkasan"} title={role === "user" ? "Kembali ke Beranda" : "Kembali ke Ringkasan"}><LogoMark size={34} /><span>Signal<b>base</b></span></Link>
        <div><span className={classes.live}><i />Live · diperbarui {s ? dayjs(s.at).locale("id").format("HH:mm") : "—"}</span><h1>Command <em>Center</em></h1></div>
        <div className={classes.chips}>
          {s?.social && <span><MessagesSquare size={15} />Sosial <b>{formatNumber(si?.current.total ?? sum(s.social.daily))}</b>{delta(si) && <small data-down={delta(si)!.startsWith("-") || undefined}>{delta(si)}</small>}</span>}
          {s?.online && <span><Newspaper size={15} />Online <b>{formatNumber(oi?.current.total ?? sum(s.online.daily))}</b>{delta(oi) && <small data-down={delta(oi)!.startsWith("-") || undefined}>{delta(oi)}</small>}</span>}
        </div>
        <div className={classes.tools}>
          <Segmented label="Periode" options={PERIODS} value={String(days)} onChange={(v) => setDays(Number(v) as InsightPeriod)} />
          {(role !== "user" || (s?.keys.length ?? 0) > 1) && s && (
            <Select aria-label="Proyek" w={180} allowDeselect={false} classNames={{ input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption }}
              comboboxProps={{ withinPortal: true, zIndex: 400 }} value={keyParam ?? (role !== "user" ? "" : kid ?? "")} onChange={(v) => setKey(v || null)}
              data={[...(role !== "user" ? [{ value: "", label: "Nasional" }] : []), ...s.keys.map((k) => ({ value: k.id, label: k.name }))]} />
          )}
          <Link href="/dashboard" className={classes.iconBtn} aria-label={role === "user" ? "Kembali ke Beranda" : "Kembali ke Ringkasan"} title={role === "user" ? "Kembali ke Beranda" : "Kembali ke Ringkasan"}><LayoutDashboard size={17} /></Link>
          <button type="button" className={classes.iconBtn} onClick={toggleFull} aria-label={full ? "Keluar layar penuh" : "Layar penuh"}>{full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
        </div>
      </header>

      <div className={classes.grid}>
        <Panel title="Emosi & sentimen" icon={Smile} accent="#fbbf24" className={classes.a}>
          <div className={classes.pair}>
            {s?.social && <Donut title="Emosi sosial" slices={slices(s.social.moods)} />}
            {s?.online && <Donut title="Sentimen online" slices={slices(s.online.moods)} />}
            {s && !s.social && !s.online && none}
          </div>
        </Panel>
        <Panel title={`Volume ${days} hari`} icon={ChartLine} accent="#c084fc" className={classes.b}>
          <LineChart labels={sd.labels} series={[...(s?.social ? [{ label: "Sosial", color: "#c084fc", values: sd.values }] : []), ...(s?.online ? [{ label: "Online", color: "#22d3ee", values: od.values }] : [])]} />
        </Panel>
        <Panel title={`Dibanding ${days} hari sebelumnya`} icon={Zap} accent="#22d3ee" className={classes.c}>
          {gauges ? <div className={classes.gauges}>{gauges.map((g) => <Gauge key={g.label} {...g} />)}</div> : <p className={classes.empty}>{wait ? "Memuat…" : "Belum ada data"}</p>}
        </Panel>
        <Panel title="Kata kunci teratas" icon={Hash} accent="#a78bfa" className={classes.d}><Bars items={words} color="#a78bfa" /></Panel>
        <Panel title="Isu teratas" icon={Flame} accent="#fb7185" className={classes.e}>{s && !s.online ? none : <Bars items={topIssues} color="#fb7185" />}</Panel>
        <Panel title="Tren sentimen harian" icon={Activity} accent="#34d399" className={classes.t}>{trend.length ? <TrendBars days={trend} /> : <p className={classes.empty}>{wait ? "Memuat…" : "Belum ada data"}</p>}</Panel>
        <Panel title="Top akun sosial" icon={UserRound} accent="#f0abfc" className={classes.f}>{s && !s.social ? none : <Bars items={accounts} color="#f0abfc" />}</Panel>
        <Panel title="Top media online" icon={Newspaper} accent="#22d3ee" className={classes.g}>{s && !s.online ? none : <Bars items={outlets} color="#22d3ee" />}</Panel>
        <section className={`${classes.panel} ${classes.h}`} style={{ ["--ac" as string]: "#fbbf24" }} aria-label="Peringatan">
          <h2><span className={classes.badge}><Siren size={15} strokeWidth={2.2} /></span>Peringatan</h2>
          <div className={classes.ticker}>{alerts.length ? <div className={classes.track}>{[0, 1].map((copy) => <div key={copy} className={classes.set} aria-hidden={copy === 1 || undefined}>{Array.from({ length: Math.ceil(8 / alerts.length) }, () => alerts).flat().map((a, i) => <span key={i} data-tone={a.tone}>{a.text}</span>)}</div>)}</div> : <span className={classes.calm}>Tidak ada peringatan, semua normal.</span>}</div>
        </section>
      </div>
    </div>
  );
}
