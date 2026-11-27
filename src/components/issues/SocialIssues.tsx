"use client";
// /issues/media-social — early-warning issues from social media (table `alerts`): ranked list on the left, the selected alert's details on the right.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, MessagesSquare, Radar, ShieldAlert, Smile, Target, Users, Zap, type LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@mantine/core";
import {
  IconAlertTriangle, IconArrowLeft, IconArrowRight, IconBellRinging, IconChartDots3, IconChevronRight, IconClock, IconExternalLink, IconFlame, IconHierarchy2, IconMapPin, IconMessages, IconRadar2, IconSparkles, IconTrophy, IconX,
} from "@tabler/icons-react";
import { formatNumber, sourceLabel } from "@/lib/media/labels";
import { DEFAULT_ONT_DAYS, formatWindow, levelColor, ONT_PERIODS, parseOntDays, TOGGLE_LEVELS, type OntIssue } from "@/lib/ontology";
import { TONE_COLOR, toneOf } from "@/lib/sna";
import { useApi } from "@/lib/useApi";
import { fromNow } from "@/lib/dates";
import { Button } from "../ui/Button";
import { useProjectId } from "@/lib/useProjectId";
import classes from "./onlineIssues.module.css";
import ews from "./socialIssues.module.css";
import { ActionCalls } from "./ActionCalls";
import { relatedOntology } from "@/lib/issueNetwork";
import { IssueNetwork, type NetworkTab } from "./IssueNetwork";
import { IssueToolbar, type IssueSort } from "./IssueToolbar";

const PERIOD_OPTIONS = ONT_PERIODS.map((p) => ({ value: String(p.days), label: p.label }));
const DAY_MS = 86_400_000;
const isNew = (i: OntIssue) => Date.now() - new Date(i.sentAt).getTime() < DAY_MS;
/** Skor: as ranked; Terbaru: sent last first; Volume: most posts first. */
const sortIssues = (list: OntIssue[], sort: IssueSort) => sort === "skor" ? list
  : [...list].sort((a, b) => sort === "terbaru" ? b.sentAt.localeCompare(a.sentAt) : b.postCount - a.postCount);
const has = (names: string[], q: string) => names.some((n) => n.toLowerCase() === q);

/** A narrative card of the alert: coloured icon tile, title and text, with a faint icon watermark. */
function Narrative({ icon: Icon, title, text, accent }: { icon: LucideIcon; title: string; text: string; accent: string }) {
  return (
    <article className={ews.card} style={{ "--accent": accent } as React.CSSProperties}>
      <Icon className={ews.watermark} size={96} strokeWidth={1.2} aria-hidden />
      <header><span className={ews.tile}><Icon size={18} strokeWidth={2} /></span><h3>{title}</h3></header>
      <p>{text}</p>
    </article>
  );
}

function Detail({ issue, rank, onEntity, entity, nav, onNetwork }: {
  issue: OntIssue; rank: number; onEntity: (name: string | null) => void; entity: string | null;
  /** Opens the issue's full-screen network on a tab. */
  onNetwork: (tab: NetworkTab) => void;
  nav: { prev: (() => void) | null; next: (() => void) | null; position: string };
}) {
  const color = levelColor(issue.level);
  const chip = (name: string, kind: "actor" | "target") => (
    <button key={`${kind}-${name}`} type="button" className={ews.chip} data-kind={kind} data-on={entity === name.toLowerCase() || undefined} onClick={() => onEntity(entity === name.toLowerCase() ? null : name.toLowerCase())}>{name}</button>
  );
  return (
    <section className={classes.detail} style={{ "--heat": color } as React.CSSProperties} aria-label="Detail isu">
      <header className={classes.detailHead}>
        <div className={classes.scoreRing} style={{ "--pct": `${Math.max(6, Math.min(100, issue.score))}%` } as React.CSSProperties} title="Skor isu">
          <span><b>{formatNumber(issue.score)}</b><small>skor</small></span>
        </div>
        <div className={classes.detailTitle}>
          <div className={classes.badges}>
            <span className={classes.rankBadge}>#{rank}</span>
            <span className={classes.hotBadge} style={{ background: color, color: "#1c1917" }}><IconBellRinging size={13} />{issue.level}</span>
            {isNew(issue) && <span className={classes.newBadge}><IconSparkles size={13} />Baru</span>}
            {issue.contentType === "commentary" && <span className={classes.newBadge}>Komentar</span>}
          </div>
          <h2>{issue.title}</h2>
          <ul className={classes.detailMeta}>
            {issue.location && <li><IconMapPin size={14} />{issue.location}</li>}
            <li><IconMessages size={14} />{formatNumber(issue.postCount)} post</li>
            <li><IconClock size={14} />Dikirim {fromNow(issue.sentAt)}</li>
            {issue.category && <li><IconRadar2 size={14} />{issue.category}</li>}
          </ul>
          <div className={classes.networkButtons}>
            <Button size="sm" variant="primary" icon={IconChartDots3} onClick={() => onNetwork("sna")}>SNA isu</Button>
            <Button size="sm" variant="secondary" icon={IconHierarchy2} onClick={() => onNetwork("ontologi")}>Ontologi isu</Button>
          </div>
        </div>
        <div className={classes.stepper}>
          <Button size="sm" variant="secondary" icon={IconArrowLeft} onClick={nav.prev ?? undefined} disabled={!nav.prev}>Sebelumnya</Button>
          <span>{nav.position}</span>
          <Button size="sm" variant="secondary" iconRight={IconArrowRight} onClick={nav.next ?? undefined} disabled={!nav.next}>Berikutnya</Button>
        </div>
      </header>

      <div className={ews.cards}>
        {issue.summary && <Narrative icon={Radar} title="Ringkasan kejadian" accent="#06b6d4" text={issue.summary} />}
        {issue.reaction && <Narrative icon={MessagesSquare} title="Reaksi publik" accent="#8b5cf6" text={issue.reaction} />}
        {issue.risk && <Narrative icon={ShieldAlert} title="Penilaian risiko" accent="#f43f5e" text={issue.risk} />}
      </div>

      <dl className={ews.facts}>
        <div><dt><Users size={16} />Aktor</dt><dd><div className={ews.chips}>{issue.actors.length ? issue.actors.map((n) => chip(n, "actor")) : <small>Tidak ada</small>}</div></dd></div>
        <div><dt><Target size={16} />Target</dt><dd><div className={ews.chips}>{issue.targets.length ? issue.targets.map((n) => chip(n, "target")) : <small>Tidak ada</small>}</div></dd></div>
        {issue.emotion && <div><dt><Smile size={16} />Emosi dominan</dt><dd><span className={ews.emotion}><i style={{ background: TONE_COLOR[toneOf(issue.emotion)] }} />{issue.emotion}</span></dd></div>}
        {issue.signals.length > 0 && <div><dt><Zap size={16} />Sinyal teratas</dt><dd><div className={ews.chips}>{issue.signals.map((x) => <span key={x} className={ews.chip} data-kind="signal">{x}</span>)}</div></dd></div>}
        {formatWindow(issue.window) && <div><dt><CalendarClock size={16} />Jendela waktu</dt><dd className={ews.time}>{formatWindow(issue.window)}</dd></div>}
      </dl>

      {issue.posts.length > 0 && (
        <div className={ews.section}>
          <h3>Post representatif</h3>
          <div className={ews.posts}>
            {issue.posts.map((p, i) => (
              <article key={i} className={ews.post}>
                <div className={ews.postHead}><i style={{ background: TONE_COLOR[toneOf(p.emotion)] }} title={p.emotion ?? "tanpa emosi"} /><b>@{p.author}</b>· {sourceLabel(p.source)}
                  {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Buka post asli"><IconExternalLink size={14} /></a>}
                </div>
                <p>{p.content || "(tanpa teks)"}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function SocialIssues() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keyId = useProjectId();
  const days = parseOntDays(params.get("days")) ?? DEFAULT_ONT_DAYS;
  const issueParam = params.get("issue");
  const [search, setSearch] = useState("");
  /** Levels picked in the filter (none = every level). */
  const [levels, setLevels] = useState<string[]>([]);
  const [entity, setEntity] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkTab | null>(null);
  const [sort, setSort] = useState<IssueSort>("skor");
  const [onlyNew, setOnlyNew] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [params, pathname, router]);

  const list = useApi<{ days: number; issues: OntIssue[] }>(`/api/admin/ontology?days=${days}${keyId ? `&project=${encodeURIComponent(keyId)}` : ""}`);
  const issues = useMemo(() => list.data?.issues ?? [], [list.data]);
  const rankOf = useMemo(() => new Map(issues.map((i, n) => [i.id, n + 1])), [issues]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(() => sortIssues(issues.filter((i) => (!levels.length || levels.includes(i.level)) && (!onlyNew || isNew(i))
    && (!entity || has(i.actors, entity) || has(i.targets, entity))
    && (!term || [i.title, i.location ?? "", ...i.actors, ...i.targets].some((s) => s.toLowerCase().includes(term)))), sort), [issues, levels, entity, term, onlyNew, sort]);
  const filtered = !!term || levels.length > 0 || !!entity || onlyNew;
  const resetFilters = () => { setSearch(""); setLevels([]); setEntity(null); setOnlyNew(false); };
  const index = Math.max(0, visible.findIndex((i) => i.id === issueParam));
  const selected = visible[index] ?? null;

  const select = useCallback((id: string, scroll?: boolean) => {
    go({ issue: id });
    if (scroll && window.innerWidth < 960) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [go]);
  const step = (delta: number) => { const target = visible[index + delta]; if (target) select(target.id); };
  useEffect(() => { if (selected) document.getElementById(`ews-${selected.id}`)?.scrollIntoView({ block: "nearest" }); }, [selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const periodLabel = ONT_PERIODS.find((p) => p.days === days)!.label;
  const stats = [
    { icon: IconBellRinging, value: issues.length, label: "isu" },
    { icon: IconFlame, value: issues.filter((i) => i.level === "Critical").length, label: "critical" },
    { icon: IconMessages, value: issues.reduce((t, i) => t + i.postCount, 0), label: "post terkait" },
  ];

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <IconMessages className={classes.heroIcon} size={110} stroke={1} aria-hidden />
        <div className={classes.heroText}>
          <span className={classes.badge}><IconMessages size={13} />Media sosial · post &amp; akun</span>
          <h1>Isu Media Sosial <em>{periodLabel}</em> terakhir</h1>
          <p>{keyId
            ? "Post media sosial proyek ini yang membahas hal yang sama, dikelompokkan tiap jam. Pilih isu untuk melihat aktor, target, reaksi publik, post, SNA, dan ontologinya."
            : "Post media sosial yang membahas hal yang sama, dikelompokkan tiap jam. Pilih isu untuk melihat aktor, target, reaksi publik, post, SNA, dan ontologinya."}</p>
        </div>
        <div className={classes.stats}>
          {stats.map((s) => <div key={s.label}><s.icon size={16} aria-hidden /><b>{list.data ? formatNumber(s.value) : "—"}</b><span>{s.label}</span></div>)}
        </div>
      </header>

      <ActionCalls days={days} keyId={keyId} />

      <IssueToolbar periods={PERIOD_OPTIONS} days={String(days)} onDays={(v) => go({ days: v, issue: null })} sort={sort} onSort={setSort}
        search={search} onSearch={setSearch} searchRef={searchRef} placeholder="Cari judul, aktor, lokasi"
        shown={list.data ? visible.length : null} total={list.data ? issues.length : null} onReset={filtered ? resetFilters : null}
        extra={entity && <button type="button" className={ews.filterChip} onClick={() => setEntity(null)} title="Hapus filter aktor/target">{entity}<IconX size={14} /></button>}
        chips={[
          ...TOGGLE_LEVELS.map((l) => ({ key: l, label: l, color: levelColor(l), on: levels.includes(l), title: levels.includes(l) ? `Hapus filter ${l}` : `Hanya isu ${l}`, count: list.data ? issues.filter((i) => i.level === l).length : null,
            onToggle: () => setLevels(levels.includes(l) ? levels.filter((x) => x !== l) : [...levels, l]) })),
          { key: "new", label: "Baru 24 jam", color: "#22d3ee", on: onlyNew, count: list.data ? issues.filter(isNew).length : null,
            title: onlyNew ? "Hapus filter Baru 24 jam" : "Hanya isu yang dikirim dalam 24 jam terakhir", onToggle: () => setOnlyNew(!onlyNew) },
        ]} />

      {list.error && <div className={classes.alert} role="alert"><IconAlertTriangle size={17} />{list.error}<Button size="sm" variant="secondary" onClick={() => void list.reload()}>Coba lagi</Button></div>}

      <div className={classes.layout}>
        <nav className={classes.list} aria-label="Daftar alert">
          <div className={classes.listHead}><IconTrophy size={16} />Peringkat isu<small>↑ ↓ untuk pindah</small></div>
          <div className={classes.listScroll}>
          {!list.data && !list.error && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={96} radius={18} />)}
          {visible.map((issue, n) => {
            const rank = rankOf.get(issue.id)!, active = issue.id === selected?.id;
            return (
              <button key={issue.id} id={`ews-${issue.id}`} type="button" className={classes.issue} data-active={active || undefined} data-top={rank <= 3 || undefined}
                aria-current={active ? "true" : undefined} style={{ "--heat": levelColor(issue.level), "--pct": `${Math.max(4, Math.min(100, issue.score))}%`, animationDelay: `${Math.min(n, 12) * 30}ms` } as React.CSSProperties}
                onClick={() => select(issue.id, true)}>
                <span className={classes.rank}>{rank <= 3 ? <IconFlame size={14} /> : null}{rank}</span>
                <span className={classes.issueBody}>
                  <b>{issue.title}</b>
                  <span className={classes.bar}><i /></span>
                  <small>
                    <span><IconBellRinging size={12} />{issue.level}</span>
                    {issue.location && <span><IconMapPin size={12} />{issue.location}</span>}
                    <span><IconMessages size={12} />{formatNumber(issue.postCount)} post</span>
                    <span><IconClock size={12} />{fromNow(issue.sentAt)}</span>
                    {isNew(issue) && <em><IconSparkles size={11} />Baru</em>}
                    {issue.contentType === "commentary" && <em>Komentar</em>}
                  </small>
                </span>
                <span className={classes.score}><b>{formatNumber(issue.score)}</b><small>skor</small></span>
                <IconChevronRight size={16} className={classes.chevron} aria-hidden />
              </button>
            );
          })}
          {list.data && !visible.length && (
            <div className={classes.empty}>
              <IconRadar2 size={26} />
              <b>{issues.length ? "Tidak ada isu yang cocok" : `Belum ada isu dalam ${periodLabel} terakhir`}</b>
              {!issues.length && days < 30 && <Button size="sm" variant="secondary" onClick={() => go({ days: String(ONT_PERIODS.find((p) => p.days > days)!.days) })}>Lihat periode lebih panjang</Button>}
            </div>
          )}
          </div>
        </nav>

        <div ref={detailRef} className={classes.detailWrap}>
          {selected ? (
            <Detail key={selected.id} issue={selected} rank={rankOf.get(selected.id)!} entity={entity} onEntity={setEntity} onNetwork={(tab) => setNetwork(tab)}
              nav={{ prev: index > 0 ? () => step(-1) : null, next: index < visible.length - 1 ? () => step(1) : null, position: `${index + 1} dari ${visible.length}` }} />
          ) : (
            list.data && <div className={classes.empty}><IconBellRinging size={26} /><b>Pilih isu di sebelah kiri</b></div>
          )}
        </div>
        {selected && (
          <IssueNetwork projectId={keyId} opened={network !== null} onClose={() => setNetwork(null)} kind="social" initialTab={network ?? "sna"} title={selected.title}
            url={`/api/admin/ontology/${encodeURIComponent(selected.id)}/network${keyId ? `?project=${encodeURIComponent(keyId)}` : ""}`}
            ontology={relatedOntology(issues, selected.id)}
            meta={<><span style={{ color: levelColor(selected.level), fontWeight: 800 }}>{selected.level}</span>· skor {formatNumber(selected.score)} · {formatNumber(selected.postCount)} post · dikirim {fromNow(selected.sentAt)}</>} />
        )}
      </div>
    </div>
  );
}
