"use client";
// EWS: issues Signalbase finds itself by clustering the selected project's social posts of the last 7 days (worker
// `isu`, hourly). Shown above the bank's alerts, which rarely name a project's keywords.
import { useState } from "react";
import { IconChevronDown, IconExternalLink, IconTrendingUp, IconUsers, IconMessages, IconSparkles } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import relativeTime from "dayjs/plugin/relativeTime";
import { formatNumber } from "@/lib/media/labels";
import { moodColorVar, moodInfo } from "@/lib/media/mood";
import { useApi } from "@/lib/useApi";
import c from "./issueClusters.module.css";

dayjs.extend(relativeTime);
const SHOWN = 6;

type Sample = { code: string; text: string; author: string | null; url: string | null; ts: string };
type Issue = {
  id: string; posts: number; authors: number; negShare: number; growth: number; score: number; keywords: string[];
  perDay: Record<string, number>; moods: [string, number][]; samples: Sample[];
  title: string | null; summary: string | null; actors: string[]; targets: string[]; firstSeen: string; lastSeen: string;
};

function Trend({ perDay }: { perDay: Record<string, number> }) {
  const days = Object.keys(perDay).sort();
  const max = Math.max(1, ...days.map((d) => perDay[d]));
  return (
    <span className={c.trend} aria-label={`Post per hari: ${days.map((d) => perDay[d]).join(", ")}`}>
      {days.map((d) => <i key={d} title={`${dayjs(d).locale("id").format("D MMM")}: ${formatNumber(perDay[d])} post`} style={{ height: `${Math.max(6, (perDay[d] / max) * 100)}%` }} data-zero={perDay[d] === 0 || undefined} />)}
    </span>
  );
}

function IssueCard({ issue, rank }: { issue: Issue; rank: number }) {
  const [open, setOpen] = useState(false);
  const rising = issue.growth >= 1.5;
  return (
    <article className={c.card}>
      <header>
        <span className={c.rank}>{rank}</span>
        <div>
          <h4>{issue.title ?? issue.keywords.slice(0, 4).join(" · ")}</h4>
          <span className={c.meta}>
            <span><IconMessages size={12} />{formatNumber(issue.posts)} post</span>
            <span><IconUsers size={12} />{formatNumber(issue.authors)} akun</span>
            <span>aktif {dayjs(`${issue.lastSeen.slice(0, 19)}`).locale("id").fromNow()}</span>
          </span>
        </div>
        <Trend perDay={issue.perDay} />
      </header>
      <div className={c.badges}>
        {rising && <span data-tone="up"><IconTrendingUp size={12} />Naik ×{issue.growth.toFixed(1)}</span>}
        <span data-tone={issue.negShare >= 0.5 ? "neg" : issue.negShare >= 0.25 ? "warn" : undefined}>Negatif {Math.round(issue.negShare * 100)}%</span>
        {issue.moods.slice(0, 3).map(([m, n]) => <span key={m} className={c.mood}><i style={{ background: moodColorVar(m) }} />{moodInfo(m).label} {formatNumber(n)}</span>)}
      </div>
      {issue.summary && <p className={c.summary}>{issue.summary}</p>}
      {(issue.actors.length > 0 || issue.targets.length > 0) && (
        <p className={c.who}>
          {issue.actors.length > 0 && <><b>Aktor</b> {issue.actors.join(", ")}</>}
          {issue.targets.length > 0 && <><b>Target</b> {issue.targets.join(", ")}</>}
        </p>
      )}
      <div className={c.keywords}>{issue.keywords.slice(0, 8).map((k) => <span key={k}>{k}</span>)}</div>
      <button type="button" className={c.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Contoh post <IconChevronDown size={14} data-open={open || undefined} />
      </button>
      {open && (
        <ul className={c.samples}>
          {issue.samples.slice(0, 4).map((s) => (
            <li key={s.code}>
              <p>{s.text}</p>
              <small>
                {s.author && <>@{s.author} · </>}{dayjs(s.ts).locale("id").format("D MMM, HH.mm")}
                {s.url && /^https?:\/\//.test(s.url) && <a href={s.url} target="_blank" rel="noopener noreferrer">Buka <IconExternalLink size={11} /></a>}
              </small>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function IssueClusters({ keyId }: { keyId: string | null }) {
  const res = useApi<{ issues: Issue[]; updatedAt: string | null }>(keyId ? `/api/admin/isu-klaster?key=${encodeURIComponent(keyId)}` : null);
  const [all, setAll] = useState(false);
  if (!keyId || !res.data) return null;
  const issues = res.data.issues;
  return (
    <section className={c.panel} aria-label="Isu dari klaster post proyek">
      <header className={c.head}>
        <span className={c.icon}><IconSparkles size={16} /></span>
        <div>
          <h3>Isu dari klaster post</h3>
          <p>Dikelompokkan Signalbase dari post media sosial proyek ini 7 hari terakhir, menurut kemiripan makna. Diperbarui tiap jam{res.data.updatedAt ? `, terakhir ${dayjs(res.data.updatedAt).locale("id").fromNow()}` : ""}.</p>
        </div>
      </header>
      {issues.length ? (
        <>
          <div className={c.grid}>{(all ? issues : issues.slice(0, SHOWN)).map((i, n) => <IssueCard key={i.id} issue={i} rank={n + 1} />)}</div>
          {issues.length > SHOWN && <button type="button" className={c.more} onClick={() => setAll((a) => !a)}>{all ? "Tampilkan lebih sedikit" : `Tampilkan semua (${issues.length})`}</button>}
        </>
      ) : <p className={c.empty}>Belum ada isu. Klaster pertama untuk proyek ini dihitung dalam satu jam setelah layanan berjalan.</p>}
    </section>
  );
}
