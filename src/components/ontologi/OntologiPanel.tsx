"use client";
// Side panel of the Ontologi graph: an issue's details and posts, or the issues an actor / target is part of (tabs).
import { useEffect, useState } from "react";
import { IconExternalLink, IconFlame, IconTarget, IconUsers, IconX } from "@tabler/icons-react";
import { formatNumber, sourceLabel } from "@/lib/media/labels";
import { toneOf, TONE_COLOR, TONE_LABEL } from "@/lib/sna";
import { issueNodeId, levelColor, type OntGraph, type OntIssue, type OntNode } from "@/lib/ontologi";
import { fromNow } from "../apiKeys/shared";
import classes from "../sna/sna.module.css";

const ISSUE_TABS = [{ id: "summary", label: "Ringkasan" }, { id: "posts", label: "Postingan" }, { id: "names", label: "Aktor & target" }] as const;
const ENTITY_TABS = [{ id: "summary", label: "Ringkasan" }, { id: "issues", label: "Isu" }] as const;
type Tab = "summary" | "posts" | "names" | "issues";

export function OntologiPanel({ node, graph, issues, onPick, onClose }: {
  node: OntNode; graph: OntGraph; issues: Map<string, OntIssue>; onPick: (id: string) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const issue = node.kind === "issue" ? issues.get(node.id.slice(2)) ?? null : null;
  const tabs = node.kind === "issue" ? ISSUE_TABS : ENTITY_TABS;
  // Issues an entity is part of, highest score first.
  const related = node.kind === "issue" ? [] : graph.links
    .filter((l) => l.source === node.id || l.target === node.id)
    .map((l) => ({ issue: issues.get((l.source === node.id ? l.target : l.source).slice(2)), role: l.role }))
    .filter((r): r is { issue: OntIssue; role: "actor" | "target" } => !!r.issue)
    .sort((a, b) => b.issue.score - a.issue.score);
  const nameButtons = (names: string[]) => (
    <div className={classes.tags}>
      {names.map((n) => { const id = `e:${n.replace(/\s+/g, " ").trim().toLowerCase()}`; return graph.nodes.some((x) => x.id === id) ? <button key={n} type="button" className={classes.tag} onClick={() => onPick(id)}>{n}</button> : <span key={n} className={classes.tag}>{n}</span>; })}
    </div>
  );

  return (
    <aside className={classes.panel} aria-label={`Detail ${node.label}`}>
      <header>
        <span className={classes.panelIcon}>{node.kind === "issue" ? <IconFlame size={18} /> : node.kind === "actor" ? <IconUsers size={18} /> : <IconTarget size={18} />}</span>
        <div><b>{node.label}</b><small>{node.kind === "issue" ? `Isu · ${node.level}` : node.kind === "actor" ? "Aktor" : "Target"}</small></div>
        <button type="button" onClick={onClose} aria-label="Tutup panel"><IconX size={17} /></button>
      </header>
      <div className={classes.tabs} role="tablist">
        {tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-active={tab === t.id || undefined} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      <div className={classes.panelBody}>
        {tab === "summary" && issue && (
          <>
            <div className={classes.kpis}>
              <div><b style={{ color: levelColor(issue.level) }}>{issue.score}</b><span>skor EWS</span></div>
              <div><b>{formatNumber(issue.postCount)}</b><span>post</span></div>
              <div><b>{issue.level}</b><span>level</span></div>
            </div>
            {issue.summary && <><h4>Ringkasan kejadian</h4><p className={classes.text}>{issue.summary}</p></>}
            {issue.reaction && <><h4>Reaksi publik</h4><p className={classes.text}>{issue.reaction}</p></>}
            {issue.risk && <><h4>Penilaian risiko</h4><p className={classes.text}>{issue.risk}</p></>}
            <h4>Rincian</h4>
            <div className={classes.tags}>
              {issue.location && <span className={classes.tag}>{issue.location}</span>}
              {issue.category && <span className={classes.tag}>{issue.category}</span>}
              {issue.emotion && <span className={classes.tag} style={{ boxShadow: `inset 0 0 0 1px ${TONE_COLOR[toneOf(issue.emotion)]}` }}>emosi: {issue.emotion}</span>}
              {issue.contentType === "commentary" && <span className={classes.tag}>komentar</span>}
              {issue.signals.map((s) => <span key={s} className={classes.tag}>{s}</span>)}
            </div>
            <p className={classes.muted}>Dikirim {fromNow(issue.sentAt)}{issue.window ? ` · jendela ${issue.window}` : ""}</p>
          </>
        )}
        {tab === "summary" && !issue && (
          <>
            <div className={classes.kpis}>
              <div><b>{node.count}</b><span>isu</span></div>
              <div><b>{node.asActor}</b><span>sebagai aktor</span></div>
              <div><b>{node.asTarget}</b><span>sebagai target</span></div>
            </div>
            <p className={classes.muted}>Lihat tab Isu untuk daftar isu yang melibatkan {node.label}.</p>
          </>
        )}

        {tab === "posts" && issue && (
          <>
            {issue.posts.length === 0 && <p className={classes.muted}>Tidak ada post representatif.</p>}
            {issue.posts.map((p, i) => (
              <article key={i} className={classes.post}>
                <div><i style={{ background: TONE_COLOR[toneOf(p.emotion)] }} title={p.emotion ?? TONE_LABEL.unknown} /><span>@{p.author} · {sourceLabel(p.source)}</span>
                  {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Buka post asli"><IconExternalLink size={14} /></a>}
                </div>
                <p>{p.content || "(tanpa teks)"}</p>
              </article>
            ))}
          </>
        )}

        {tab === "names" && issue && (
          <>
            <h4>Aktor</h4>{issue.actors.length ? nameButtons(issue.actors) : <p className={classes.muted}>Tidak ada.</p>}
            <h4>Target</h4>{issue.targets.length ? nameButtons(issue.targets) : <p className={classes.muted}>Tidak ada.</p>}
          </>
        )}

        {tab === "issues" && (
          <ul className={classes.rel}>
            {related.map((r) => (
              <li key={r.issue.id}><button type="button" onClick={() => onPick(issueNodeId(r.issue.id))}><i style={{ background: levelColor(r.issue.level) }} />{r.issue.title}<b>{r.role === "actor" ? "aktor" : "target"}</b></button></li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
