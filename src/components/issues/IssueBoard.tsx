"use client";
// /isu — the top news issues of a period (left) and the news behind the selected one (right).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Skeleton } from "@mantine/core";
import {
  IconAlertTriangle, IconArrowLeft, IconArrowRight, IconChevronRight, IconClock, IconExternalLink, IconFlame, IconMapPin, IconNews, IconRadar2, IconSearch,
  IconSparkles, IconTrendingUp, IconTrophy, IconUser, IconX,
} from "@tabler/icons-react";
import { api } from "@/lib/api-client";
import { DEFAULT_ISSUE_DAYS, DEFAULT_ISSUE_TOPIC, ISSUE_PERIODS, ISSUE_TOPICS, parseIssueDays, parseIssueTopic, type IssueNews, type IssueSource, type IssueSummary } from "@/lib/issues";
import { allowsType, type KeyScope } from "@/lib/media/keyScope";
import { capitalize, formatNumber, sourceLabel } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import { formatDate, fromNow } from "../apiKeys/shared";
import controlClasses from "../media/controls.module.css";
import { Segmented } from "../media/controls";
import { Button, StatusPill } from "../ui/Button";
import classes from "./issues.module.css";

type ListResponse = { days: number; issues: IssueSummary[] };
type DetailResponse = { issue: IssueSummary; page: number; items: IssueNews[]; hasMore: boolean; sources: IssueSource[] | null };
type KeyRow = { id: string; name: string; scope: KeyScope; revokedAt: string | null };

const DAY_MS = 86_400_000;
const PERIOD_OPTIONS = ISSUE_PERIODS.map((p) => ({ value: String(p.days), label: p.label }));
const isNew = (issue: IssueSummary) => Date.now() - new Date(issue.firstSeenAt).getTime() < DAY_MS;
/** Heat colour from the share of the top score: hot red, warm orange, calm violet. */
const heat = (score: number, max: number) => (score / max > 0.66 ? "#f43f5e" : score / max > 0.33 ? "#fb923c" : "#8b5cf6");
const dayLabel = (iso: string) => {
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / DAY_MS);
  return diff <= 0 ? "Hari ini" : diff === 1 ? "Kemarin" : formatDate(iso).split(",")[0];
};
const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

function NewsCard({ news, delay }: { news: IssueNews; delay: number }) {
  const [failed, setFailed] = useState(false);
  const href = safeUrl(news.url);
  return (
    <article className={classes.news} style={{ animationDelay: `${delay}ms` }}>
      {news.image && !failed && (
        <div className={classes.newsImage}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={news.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
          {news.category && <span className={classes.newsCategory}>{capitalize(news.category)}</span>}
        </div>
      )}
      <div className={classes.newsBody}>
        <div className={classes.newsMeta}>
          <b>{sourceLabel(news.source)}</b>
          <time dateTime={news.publishedAt} title={formatDate(news.publishedAt)}><IconClock size={12} />{fromNow(news.publishedAt)}</time>
        </div>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className={classes.newsTitle}>{news.title}</a> : <span className={classes.newsTitle}>{news.title}</span>}
        {news.preview && <p>{news.preview}</p>}
        <div className={classes.newsFoot}>
          {news.author && <span><IconUser size={12} />{news.author}</span>}
          {news.province && <span><IconMapPin size={12} />{news.province}</span>}
          {(!news.image || failed) && news.category && <span>{capitalize(news.category)}</span>}
          {href && <IconExternalLink size={14} className={classes.newsOpen} aria-hidden />}
        </div>
      </div>
    </article>
  );
}

function IssueDetail({ issue, rank, max, keyId, topic, nav }: {
  issue: IssueSummary; rank: number; max: number; keyId: string | null; topic: string;
  nav: { prev: (() => void) | null; next: (() => void) | null; position: string };
}) {
  const [source, setSource] = useState<string | null>(null);
  const [sources, setSources] = useState<IssueSource[]>([]);
  const [items, setItems] = useState<IssueNews[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number, nextSource: string | null, isCurrent: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(nextPage) });
      qs.set("topik", topic);
      if (keyId) qs.set("key", keyId);
      if (nextSource) qs.set("source", nextSource);
      const res = await api<DetailResponse>(`/api/admin/issues/${issue.id}?${qs}`);
      if (!isCurrent()) return;
      setItems((prev) => (nextPage === 1 ? res.items : [...prev, ...res.items]));
      setPage(nextPage);
      setHasMore(res.hasMore);
      if (res.sources) setSources(res.sources);
    } catch (e) {
      if (isCurrent()) setError((e as Error).message);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [issue.id, keyId, topic]);

  // The component is keyed by issue, so a new issue starts from scratch; a new source filter reloads page 1.
  useEffect(() => {
    let current = true;
    void load(1, source, () => current);
    return () => { current = false; };
  }, [load, source]);

  const color = heat(issue.score, max);
  const headline = issue.label && issue.label !== issue.title ? issue.label : null;
  let lastDay = "";

  return (
    <section className={classes.detail} style={{ "--heat": color } as React.CSSProperties} aria-label="Detail isu">
      <header className={classes.detailHead}>
        <div className={classes.scoreRing} style={{ "--pct": `${Math.max(6, Math.round((issue.score / max) * 100))}%` } as React.CSSProperties} title="Skor isu">
          <span><b>{formatNumber(issue.score)}</b><small>skor</small></span>
        </div>
        <div className={classes.detailTitle}>
          <div className={classes.badges}>
            <span className={classes.rankBadge}>#{rank}</span>
            {rank <= 3 && <span className={classes.hotBadge}><IconFlame size={13} />Panas</span>}
            {isNew(issue) && <span className={classes.newBadge}><IconSparkles size={13} />Baru</span>}
            <StatusPill tone={issue.active ? "success" : "neutral"}>{issue.active ? "Berlangsung" : "Selesai"}</StatusPill>
          </div>
          <h2>{issue.title}</h2>
          {headline && <p className={classes.headline}>{headline}</p>}
          <ul className={classes.detailMeta}>
            <li><IconNews size={14} />{formatNumber(issue.newsCount)} berita</li>
            <li><IconClock size={14} />Terakhir muncul {fromNow(issue.lastSeenAt)}</li>
            <li><IconTrendingUp size={14} />Sejak {formatDate(issue.firstSeenAt).split(",")[0]}</li>
          </ul>
        </div>
        <div className={classes.stepper}>
          <Button size="sm" variant="secondary" icon={IconArrowLeft} onClick={nav.prev ?? undefined} disabled={!nav.prev}>Sebelumnya</Button>
          <span>{nav.position}</span>
          <Button size="sm" variant="secondary" iconRight={IconArrowRight} onClick={nav.next ?? undefined} disabled={!nav.next}>Berikutnya</Button>
        </div>
      </header>

      {sources.length > 1 && (
        <div className={classes.sources} role="group" aria-label="Saring sumber">
          <button type="button" aria-pressed={!source} data-active={!source || undefined} onClick={() => setSource(null)}>Semua<em>{formatNumber(issue.newsCount)}</em></button>
          {sources.map((s) => (
            <button key={s.source} type="button" aria-pressed={source === s.source} data-active={source === s.source || undefined} onClick={() => setSource(source === s.source ? null : s.source)}>
              {sourceLabel(s.source)}<em>{formatNumber(s.count)}</em>
            </button>
          ))}
        </div>
      )}

      {error && <div className={classes.alert} role="alert"><IconAlertTriangle size={17} />{error}<Button size="sm" variant="secondary" onClick={() => void load(page || 1, source, () => true)}>Coba lagi</Button></div>}

      <div className={classes.newsGrid}>
        {items.map((n, i) => {
          const day = dayLabel(n.publishedAt);
          const heading = day !== lastDay ? <h3 key={`d-${n.code}`} className={classes.day}>{day}</h3> : null;
          lastDay = day;
          return [heading, <NewsCard key={n.code} news={n} delay={(i % 20) * 25} />];
        })}
        {loading && Array.from({ length: items.length ? 2 : 6 }, (_, i) => <Skeleton key={`s${i}`} h={230} radius={16} />)}
      </div>

      {!loading && !items.length && !error && <div className={classes.empty}><IconNews size={26} /><b>Belum ada berita untuk isu ini</b></div>}
      {hasMore && !loading && <Button variant="secondary" block icon={IconNews} onClick={() => void load(page + 1, source, () => true)}>Muat berita lainnya</Button>}
    </section>
  );
}

export function IssueBoard({ keyLocked }: { keyLocked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keyId = params.get("key");
  const days = parseIssueDays(params.get("days")) ?? DEFAULT_ISSUE_DAYS;
  const topic = parseIssueTopic(params.get("topik")) ?? DEFAULT_ISSUE_TOPIC;
  const topicLabel = ISSUE_TOPICS.find((t) => t.id === topic)!.label;
  const issueParam = params.get("issue");
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [params, pathname, router]);

  const keys = useApi<KeyRow[]>("/api/admin/keys");
  const projects = (keys.data ?? []).filter((k) => !k.revokedAt && allowsType(k.scope, "online"));
  const list = useApi<ListResponse>(`/api/admin/issues?days=${days}&topik=${topic}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`);
  const issues = useMemo(() => list.data?.issues ?? [], [list.data]);
  const max = Math.max(1, ...issues.map((i) => i.score));
  const rankOf = useMemo(() => new Map(issues.map((i, n) => [i.id, n + 1])), [issues]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(() => issues.filter((i) => (!onlyActive || i.active) && (!term || i.title.toLowerCase().includes(term) || i.label?.toLowerCase().includes(term))), [issues, onlyActive, term]);
  const index = Math.max(0, visible.findIndex((i) => i.id === issueParam));
  const selected = visible[index] ?? null;

  const select = useCallback((id: string, scroll?: boolean) => {
    go({ issue: id });
    if (scroll && window.innerWidth < 960) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [go]);
  const step = (delta: number) => { const target = visible[index + delta]; if (target) select(target.id); };

  useEffect(() => { // keep the selected issue visible in the list
    if (selected) document.getElementById(`issue-${selected.id}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

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

  const periodLabel = ISSUE_PERIODS.find((p) => p.days === (list.data?.days ?? days))?.label ?? "";
  const stats = [
    { icon: IconFlame, value: Math.round(issues[0]?.score ?? 0), label: "skor tertinggi" },
    { icon: IconNews, value: issues.reduce((t, i) => t + i.newsCount, 0), label: "berita terkait" },
    { icon: IconTrendingUp, value: issues.filter((i) => i.active).length, label: "masih berlangsung" },
  ];

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <IconFlame className={classes.heroIcon} size={150} stroke={1} aria-hidden />
        <div className={classes.heroText}>
          <span className={classes.badge}><IconRadar2 size={13} />Radar isu</span>
          <h1>{topicLabel} <em>{periodLabel || "…"}</em> terakhir</h1>
          <p>Berita yang sejenis dikelompokkan menjadi satu isu dan diurutkan dari yang paling ramai. Pilih isu untuk melihat berita di baliknya.</p>
        </div>
        <div className={classes.stats}>
          {stats.map((s) => (
            <div key={s.label}><s.icon size={16} aria-hidden /><b>{list.data ? formatNumber(s.value) : "—"}</b><span>{s.label}</span></div>
          ))}
        </div>
      </header>

      <div className={classes.toolbar}>
        <Segmented label="Periode isu" options={PERIOD_OPTIONS} value={String(days)} onChange={(v) => go({ days: v })} />
        {(!keyLocked || projects.length > 1) && projects.length > 0 && (
          <Select aria-label="Proyek" w={220} allowDeselect={false} classNames={{ input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption }}
            comboboxProps={{ withinPortal: true, zIndex: 400 }} value={keyId ?? ""} onChange={(v) => go({ key: v || null, issue: null })}
            data={[...(keyLocked ? [] : [{ value: "", label: "Semua isu" }]), ...projects.map((k) => ({ value: k.id, label: k.name }))]} />
        )}
        <button type="button" className={classes.toggle} data-active={onlyActive || undefined} aria-pressed={onlyActive} onClick={() => setOnlyActive(!onlyActive)}><IconTrendingUp size={14} />Masih berlangsung</button>
        <label className={classes.search}>
          <IconSearch size={15} />
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder="Cari isu  ( / )" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Hapus pencarian"><IconX size={14} /></button>}
        </label>
      </div>

      {list.error && <div className={classes.alert} role="alert"><IconAlertTriangle size={17} />{list.error}<Button size="sm" variant="secondary" onClick={() => void list.reload()}>Coba lagi</Button></div>}

      <div className={classes.layout}>
        <nav className={classes.list} aria-label="Daftar isu">
          <div className={classes.listHead}><IconTrophy size={16} />Peringkat isu<small>↑ ↓ untuk pindah</small></div>
          {!list.data && !list.error && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={96} radius={18} />)}
          {visible.map((issue, n) => {
            const rank = rankOf.get(issue.id)!;
            const active = issue.id === selected?.id;
            return (
              <button key={issue.id} id={`issue-${issue.id}`} type="button" className={classes.issue} data-active={active || undefined} data-top={rank <= 3 || undefined}
                aria-current={active ? "true" : undefined} style={{ "--heat": heat(issue.score, max), "--pct": `${Math.max(4, Math.round((issue.score / max) * 100))}%`, animationDelay: `${Math.min(n, 12) * 30}ms` } as React.CSSProperties}
                onClick={() => select(issue.id, true)}>
                <span className={classes.rank}>{rank <= 3 ? <IconFlame size={14} /> : null}{rank}</span>
                <span className={classes.issueBody}>
                  <b>{issue.title}</b>
                  <span className={classes.bar}><i /></span>
                  <small>
                    <span><IconNews size={12} />{formatNumber(issue.newsCount)} berita</span>
                    <span><IconClock size={12} />{fromNow(issue.lastSeenAt)}</span>
                    {isNew(issue) && <em><IconSparkles size={11} />Baru</em>}
                    {issue.active && <em data-live>Berlangsung</em>}
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
              {!issues.length && days < 30 && <Button size="sm" variant="secondary" onClick={() => go({ days: String(ISSUE_PERIODS.find((p) => p.days > days)!.days) })}>Lihat periode lebih panjang</Button>}
            </div>
          )}
        </nav>

        <div ref={detailRef} className={classes.detailWrap}>
          {selected ? (
            <IssueDetail key={`${topic}-${selected.id}`} issue={selected} rank={rankOf.get(selected.id)!} max={max} keyId={keyId} topic={topic}
              nav={{ prev: index > 0 ? () => step(-1) : null, next: index < visible.length - 1 ? () => step(1) : null, position: `${index + 1} dari ${visible.length}` }} />
          ) : (
            list.data && <div className={classes.empty}><IconNews size={26} /><b>Pilih isu di sebelah kiri</b></div>
          )}
        </div>
      </div>
    </div>
  );
}
