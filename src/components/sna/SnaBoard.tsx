"use client";
// /analisis/sna — who the most active accounts mention, as a d3 force graph. Line colour = emotion of the posts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconChartDots3, IconEye, IconEyeOff, IconHierarchy2, IconUnlink, IconFlame, IconInfoCircle, IconLock, IconLockOpen, IconMaximize, IconMinimize, IconMoodSmile, IconUsers, IconUsersGroup } from "@tabler/icons-react";
import { drag } from "d3-drag";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { allowsType, type KeyScope } from "@/lib/media/keyScope";
import { formatNumber } from "@/lib/media/labels";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { accountsPerIssue, ACCOUNT_LABEL, parseSnaFlow, SNA_FLOWS, WAVE_LABEL, dominantTone, filterGraph, DEFAULT_SNA_DAYS, DEFAULT_SNA_LIMIT, parseSnaDays, parseSnaLimit, SNA_LIMITS, SNA_PERIODS, TONE_COLOR, TONE_LABEL, type SnaGraph, type SnaLink, type SnaNode, type Tone } from "@/lib/sna";
import { useApi } from "@/lib/useApi";
import controlClasses from "../media/controls.module.css";
import { Segmented } from "../media/controls";
import { Button } from "../ui/Button";
import { SnaFlowGuide } from "./SnaFlowGuide";
import { NetworkHeader } from "./NetworkHeader";
import { MenuRow, ViewMenu } from "./ViewMenu";
import type { GephiColor, GephiSize } from "./GephiGraph";
import type { NetworkAnalysis } from "@/lib/snaNetwork";
import { TREE_COMPACT, TREE_ROOMY, treeLayout, withoutNodes, type TreeLayout } from "@/lib/snaTree";
import { SnaPanel } from "./SnaPanel";
import { SnaWatchPicker, type SnaWatch } from "./SnaWatches";
import classes from "./sna.module.css";

type KeyRow = { id: string; name: string; scope: KeyScope; revokedAt: string | null };
type Node = SnaNode & SimulationNodeDatum;
type Edge = Omit<SnaLink, "source" | "target"> & SimulationLinkDatum<Node> & { source: Node; target: Node };
const LIMIT_OPTIONS = SNA_LIMITS.map((n) => ({ value: String(n), label: `${n} akun teratas` }));
// Issue view: the same choice is the number of accounts per issue.
const PER_ISSUE_OPTIONS = SNA_LIMITS.map((n) => ({ value: String(n), label: `${accountsPerIssue(n)} akun per isu` }));
const PERIOD_OPTIONS = SNA_PERIODS.map((p) => ({ value: String(p.days), label: p.label }));
// Gephi mode draws with sigma.js (WebGL), so it loads only in the browser and only when chosen.
const GephiGraph = dynamic(() => import("./GephiGraph").then((m) => m.GephiGraph), { ssr: false });
const STYLE_OPTIONS = [{ value: "klasik", label: "Klasik" }, { value: "gephi", label: "Gephi" }] as const;
const COLOR_OPTIONS = [{ value: "klaster", label: "Klaster" }, { value: "emosi", label: "Emosi" }] as const;
const SIZE_OPTIONS = [{ value: "engagement", label: "Engagement" }, { value: "betweenness", label: "Jembatan" }] as const;
const FLOW_NOTE = { langsung: "", mention: "Anak = akun yang menyebut/membalas akun lebih awal", rantai: "Urut waktu post pertama, dari isu", gelombang: "Anak = gelombang waktu berikutnya" } as const;
const FLOW_OPTIONS = SNA_FLOWS.map((f) => ({ value: f.value, label: f.label }));
const VIEW_OPTIONS = [{ value: "isu", label: "Isu" }, { value: "mention", label: "Mention" }] as const;
const TONES: Tone[] = ["negative", "neutral", "positive", "unknown"];
// Lucide "users" (hub) and "user" (child) glyphs, 24×24.
const ICON = {
  hub: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};
// A mentioned account shows the emotion of the posts that mention it: Lucide frown / meh / smile.
const FACE = '<circle cx="12" cy="12" r="10"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>';
const CHILD_ICON: Record<Tone, string> = {
  negative: `${FACE}<path d="M16 16s-1.5-2-4-2-4 2-4 2"/>`,
  neutral: `${FACE}<line x1="7" x2="17" y1="15.5" y2="15.5"/>`,
  positive: `${FACE}<path d="M8 14s1.5 2 4 2 4-2 4-2"/>`,
  unknown: ICON.user,
};
// Lucide "newspaper" (news outlet) and "landmark" (institution) for accounts that are not the public.
const KIND_ICON = {
  media: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  institusi: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
};
/** A main account's disc: white for the public, a light tint for outlets (amber) and institutions (blue). */
const HUB_FILL = { publik: "#ffffff", media: "#fef3c7", institusi: "#dbeafe" };
const special = (n: SnaNode) => n.account === "media" || n.account === "institusi";
// Lucide "flame": an issue.
const FLAME = '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>';
/** Engagement spans 0 to hundreds of thousands, so sizes follow its logarithm (10 -> 1, 1,000 -> 3, 100,000 -> 5). */
const lg = (n = 0) => Math.log10(1 + Math.max(0, n));
const radius = (n: SnaNode) => n.kind === "issue" ? 30 + Math.min(26, Math.sqrt(n.posts) * 1.6)
  : n.kind === "hub" ? (n.engagement !== undefined ? 12 + Math.min(24, lg(n.engagement) * 5) : 16 + Math.min(18, Math.sqrt(n.posts) * 2))
  : n.engagement !== undefined ? 5 + Math.min(12, lg(n.engagement) * 2.6) : 5 + Math.min(9, Math.sqrt(n.mentions) * 2);
/** An issue title over at most two lines of about 30 characters. */
function titleLines(title = "") {
  const words = title.split(/\s+/), lines = [""];
  for (const w of words) {
    if ((lines.at(-1)! + " " + w).trim().length > 30 && lines.at(-1)) { if (lines.length === 2) { lines[1] += "…"; break; } lines.push(w); }
    else lines[lines.length - 1] = (lines.at(-1)! + " " + w).trim();
  }
  return lines;
}

function Graph({ graph, onPick, picked, locked, layout }: { graph: SnaGraph; onPick: (id: string | null) => void; picked: string | null; locked: boolean; layout: TreeLayout | null }) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const lockedRef = useRef(locked);
  const simRef = useRef<ReturnType<typeof forceSimulation<Node>> | null>(null);

  useEffect(() => {
    const el = svg.current, wrap = box.current;
    if (!el || !wrap) return;
    const nodes: Node[] = graph.nodes.map((n) => ({ ...n }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = graph.links.map((l) => ({ ...l, source: byId.get(l.source)!, target: byId.get(l.target)! })) as Edge[];
    // A main account takes the emotion of its own posts (its outgoing links); a mentioned account that of the posts mentioning it.
    const incoming = new Map<string, Record<Tone, number>>(), outgoing = new Map<string, Record<Tone, number>>();
    const add = (m: Map<string, Record<Tone, number>>, id: string, l: SnaLink) => {
      const c = m.get(id) ?? { negative: 0, neutral: 0, positive: 0, unknown: 0 };
      for (const t of TONES) c[t] += l.counts[t];
      m.set(id, c);
    };
    for (const l of graph.links) { add(incoming, l.target, l); add(outgoing, l.source, l); }
    const toneOfNode = (id: string, kind: SnaNode["kind"] = "child"): Tone => { const c = (kind === "hub" ? outgoing : incoming).get(id); return c ? dominantTone(c) : "unknown"; };
    const root = select(el);
    root.selectAll("*").remove();
    root.append("defs").html('<radialGradient id="sna-issue" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#5b21b6"/></radialGradient>');
    const view = root.append("g");
    const issueMode = nodes.some((n) => n.kind === "issue");
    const link = view.append("g").selectAll<SVGLineElement, Edge>("line").data(edges).join("line")
      .attr("stroke", (d) => TONE_COLOR[d.tone]).attr("stroke-width", (d) => 1 + Math.sqrt(d.n)).attr("stroke-opacity", 0.9).attr("stroke-linecap", "round").attr("class", classes.flow);
    const node = view.append("g").selectAll<SVGGElement, Node>("g").data(nodes).join("g").attr("data-id", (d) => d.id).style("cursor", "pointer");
    // Issue: a big violet disc with a flame, its border the emotion of the posts about it. Account: white disc. Mentioned: dark disc with a face.
    node.append("circle").attr("r", radius)
      .attr("fill", (d) => (d.kind === "issue" ? "url(#sna-issue)" : d.kind === "hub" ? HUB_FILL[d.account ?? "publik"] : "#1e1b4b"))
      .attr("stroke", (d) => TONE_COLOR[toneOfNode(d.id, d.kind)]).attr("stroke-width", (d) => (d.kind === "issue" ? 5 : d.kind === "hub" ? 4 : 2));
    node.append("g").attr("fill", "none").attr("stroke", (d) => (d.kind === "issue" ? "#ffffff" : d.kind === "hub" ? "#2e1065" : TONE_COLOR[toneOfNode(d.id)])).attr("stroke-width", 2).attr("stroke-linecap", "round").attr("stroke-linejoin", "round")
      .attr("transform", (d) => { const k = (radius(d) * (d.kind === "issue" ? 0.95 : special(d) ? 1.05 : d.kind === "hub" ? 1.15 : toneOfNode(d.id) === "unknown" ? 1.25 : 1.7)) / 24; return `scale(${k}) translate(-12,-12)`; })
      .style("pointer-events", "none")
      // Outlets and institutions show their own glyph (a newspaper, a building); public accounts keep the people / face icons.
      .html((d) => (d.kind === "issue" ? FLAME : special(d) ? KIND_ICON[d.account as "media" | "institusi"] : d.kind === "hub" ? ICON.hub : CHILD_ICON[toneOfNode(d.id)]));
    node.filter((d) => d.kind === "hub").append("text").text((d) => d.id).attr("text-anchor", "middle").attr("dy", (d) => -radius(d) - 6).attr("fill", "#ede9fe").attr("font-size", 12).attr("font-weight", 700).style("pointer-events", "none");
    node.filter((d) => d.kind === "issue").append("text").attr("text-anchor", "middle").attr("fill", "#ffffff").attr("font-size", 13).attr("font-weight", 800).style("pointer-events", "none")
      .each((d, i, els) => {
        const lines = titleLines(d.title);
        select(els[i]).selectAll("tspan").data(lines).join("tspan").attr("x", 0).attr("dy", (_l, j) => (j === 0 ? -radius(d) - 10 - (lines.length - 1) * 15 : 15)).text((l) => l);
      });

    node.filter((d) => d.kind === "child").append("text").text((d) => d.id).attr("text-anchor", "middle").attr("dy", (d) => radius(d) + 11).attr("fill", "#bae6fd").attr("font-size", 9.5).style("pointer-events", "none");
    // A pill behind each name keeps it readable over the lines.
    node.selectAll<SVGTextElement, Node>("text").each((d, i, els) => {
      const t = els[i], b = t.getBBox();
      select(t.parentNode as SVGGElement).insert("rect", () => t).attr("x", b.x - 4).attr("y", b.y - 1).attr("width", b.width + 8).attr("height", b.height + 2).attr("rx", 5)
        .attr("fill", d.kind === "issue" ? "rgba(91,33,182,.92)" : d.kind === "hub" ? "rgba(46,16,101,.85)" : "rgba(15,13,36,.78)").style("pointer-events", "none");
    });
    const tipEl = tip.current!;
    const place = (e: MouseEvent) => { const r = wrap.getBoundingClientRect(); tipEl.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`; };
    const text = (s: string) => Object.assign(document.createElement("span"), { textContent: s });
    node.on("mousemove", (e: MouseEvent, d) => {
      tipEl.replaceChildren();
      const b = document.createElement("b");
      const eng = d.engagement !== undefined ? ` · engagement ${formatNumber(Math.round(d.engagement))}` : "";
      if (d.kind === "issue") { b.textContent = d.title ?? "Isu"; tipEl.append(b, text(`Isu · ${formatNumber(d.posts)} post`), text(`Emosi dominan: ${TONE_LABEL[toneOfNode(d.id, d.kind)]}`), text("Klik untuk menyorot akunnya · seret untuk menata, klik ganda melepas")); }
      else { b.textContent = `@${d.id}${d.account ? ` · ${ACCOUNT_LABEL[d.account]}` : ""}`; tipEl.append(b, text(d.kind === "hub" ? (issueMode ? `${formatNumber(d.posts)} post di isu${eng}` : `Top poster · ${formatNumber(d.posts)} post · ${formatNumber(d.mentions)} mention${eng}`) : `Disebut ${formatNumber(d.mentions)}×${eng}`), text(`Emosi dominan: ${TONE_LABEL[toneOfNode(d.id, d.kind)]}`));
        // The stored time is Jakarta wall-clock, shown as is.
        if (d.first) tipEl.append(text(`Pertama posting: ${dayjs(d.first).locale("id").format("D MMM YYYY, HH:mm")} WIB${d.wave ? ` · ${WAVE_LABEL[d.wave]}` : ""}`));
        tipEl.append(text("Klik untuk detail · seret untuk menata, klik ganda melepas")); }
      tipEl.dataset.on = "1"; place(e);
    }).on("mouseleave", () => delete tipEl.dataset.on).on("click", (e: MouseEvent, d) => { e.stopPropagation(); pickRef.current(d.id); });
    link.on("mousemove", (e: MouseEvent, d) => {
      tipEl.replaceChildren();
      const b = document.createElement("b"); b.textContent = d.target.kind === "issue" ? `@${d.source.id} · ${d.n} post di isu ini` : `@${d.source.id} → @${d.target.id} · ${d.n}×`; tipEl.append(b);
      for (const t of TONES) if (d.counts[t]) tipEl.append(text(`${TONE_LABEL[t]}: ${d.counts[t]}`));
      tipEl.dataset.on = "1"; place(e);
    }).on("mouseleave", () => delete tipEl.dataset.on);
    root.on("click", () => pickRef.current(null));

    // Issue view with a flow (mention, chain, waves): accounts hang under accounts, so those links are short and tight and
    // accounts push less, keeping each issue's tree compact.
    const tree = issueMode && graph.links.some((l) => !l.target.startsWith("issue:"));
    const sim = forceSimulation<Node>(nodes)
      .force("link", forceLink<Node, Edge>(edges).id((d) => d.id)
        .distance((d) => (tree && d.target.kind !== "issue" ? 14 + radius(d.target) + radius(d.source) : issueMode ? 60 + radius(d.target) + radius(d.source) : 90 + radius(d.source)))
        .strength((d) => (tree && d.target.kind !== "issue" ? 0.9 : issueMode ? 0.5 : 0.7)))
      .force("charge", forceManyBody<Node>().strength((d) => (d.kind === "issue" ? (tree ? -900 : -1400) : d.kind === "hub" ? (issueMode ? (tree ? -70 : -160) : -500) : -45)))
      .force("collide", forceCollide<Node>().radius((d) => radius(d) + 6))
      .on("tick", () => paint());
    const paint = () => {
      link.attr("x1", (d) => d.source.x!).attr("y1", (d) => d.source.y!).attr("x2", (d) => d.target.x!).attr("y2", (d) => d.target.y!);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    };
    simRef.current = sim;
    sim.stop();
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on("zoom", (e) => view.attr("transform", e.transform.toString()))
      .filter((e) => !lockedRef.current && (!e.target.closest?.("[data-id]") || e.type === "wheel"));
    root.call(z);
    // Pan and zoom so every node is in view (called whenever the layout is rebuilt, e.g. after switching an emotion off).
    const fitView = () => {
      const { width, height } = wrap.getBoundingClientRect();
      // The filter bar floats over the top and the legend over the bottom: frame the graph in the space between.
      const stageEl = wrap.closest("section");
      const bar = stageEl?.querySelector<HTMLElement>("[role=toolbar]");
      const top = (bar ? bar.offsetTop + bar.offsetHeight : 0) + 24;
      const bottom = (stageEl?.querySelector<HTMLElement>("aside[aria-label=Legenda]")?.offsetHeight ?? 0) + 20;
      const room = Math.max(120, height - top - bottom);
      const xs = nodes.map((n) => n.x ?? 0), ys = nodes.map((n) => n.y ?? 0);
      const x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 60, y0 = Math.min(...ys) - (issueMode ? 70 : 40), y1 = Math.max(...ys) + 40;
      const k = Math.min(1.4, Math.max(0.2, Math.min(width / (x1 - x0), room / (y1 - y0))));
      root.call(z.transform, zoomIdentity.translate(width / 2 - (k * (x0 + x1)) / 2, top + room / 2 - (k * (y0 + y1)) / 2).scale(k));
    };
    // The graph fades in once it is arranged and framed, so nodes do not jump around on screen.
    el.style.transition = "none";
    el.style.opacity = "0";
    let timer = 0;
    const reveal = () => requestAnimationFrame(() => { el.style.transition = "opacity 450ms ease"; el.style.opacity = "1"; });
    const fit = () => {
      // Tree: every node pinned where the tree puts it (dragging still moves one; double-click lets it float).
      if (layout) {
        for (const n of nodes) { const p = layout.pos.get(n.id); if (p) { n.x = n.fx = p.x; n.y = n.fy = p.y; } }
        sim.stop(); paint(); fitView(); reveal();
        return;
      }
      const { width, height } = wrap.getBoundingClientRect();
      // Hubs sit on a ring so their clusters stay apart; children are only pulled loosely to the middle.
      // Issue view: the issues are the ring; their accounts gather around them.
      const hubs = nodes.filter((n) => n.kind === (issueMode ? "issue" : "hub")), ring = Math.min(width, height) * 0.36, cy = height / 2 + 20;
      const at = (d: Node) => { const i = hubs.indexOf(d); const a = (i / hubs.length) * 2 * Math.PI - Math.PI / 2; return i < 0 ? null : [width / 2 + ring * Math.cos(a), cy + ring * Math.sin(a)]; };
      const anchor = (d: Node) => (issueMode ? d.kind === "issue" : d.kind === "hub");
      sim.force("x", forceX<Node>((d) => at(d)?.[0] ?? width / 2).strength((d) => (anchor(d) ? 0.25 : 0.015)))
        .force("y", forceY<Node>((d) => at(d)?.[1] ?? cy).strength((d) => (anchor(d) ? 0.25 : 0.015))).alpha(0.5);
      // Locked: settle the layout off-screen so it opens already arranged, then keep it still.
      if (lockedRef.current) { for (let i = 0; i < 300; i++) sim.tick(); paint(); fitView(); reveal(); }
      else { sim.on("end", () => { fitView(); sim.on("end", null); }); sim.restart(); window.clearTimeout(timer); timer = window.setTimeout(() => { fitView(); reveal(); }, 600); }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    node.call(drag<SVGGElement, Node>().filter(() => !lockedRef.current)
      .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
      // A dragged node stays where it is dropped (tidying by hand); double-click frees it again.
      .on("end", (e) => { if (!e.active) sim.alphaTarget(0); }));
    node.on("dblclick.pin", (e, d) => { e.stopPropagation(); d.fx = null; d.fy = null; sim.alpha(0.3).restart(); });
    return () => { window.clearTimeout(timer); sim.stop(); ro.disconnect(); root.on(".zoom", null).selectAll("*").remove(); };
  }, [graph, layout]);

  // Locked: the layout freezes and pan, zoom and drag are off; unlocking lets it settle again.
  useEffect(() => {
    lockedRef.current = locked;
    if (locked) simRef.current?.stop(); else simRef.current?.alpha(0.2).restart();
  }, [locked]);

  // Highlight the picked node and what it touches; dim the rest.
  useEffect(() => {
    const root = select(svg.current!);
    const near = new Set<string>();
    if (picked) for (const l of graph.links) { if (l.source === picked) near.add(l.target); if (l.target === picked) near.add(l.source); }
    root.selectAll<SVGGElement, Node>("g[data-id]").attr("opacity", (d) => (!picked || d.id === picked || near.has(d.id) ? 1 : 0.15));
    root.selectAll<SVGLineElement, Edge>(`line.${classes.flow}`).attr("stroke-opacity", (d) => (!picked ? 0.9 : d.source.id === picked || d.target.id === picked ? 1 : 0.06));
  }, [picked, graph]);

  return <div ref={box} className={classes.canvas}><svg ref={svg} role="img" aria-label="Graf jaringan akun" /><div ref={tip} className={classes.tip} /></div>;
}

export function SnaBoard({ keyLocked }: { keyLocked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keyId = params.get("key");
  // Within a project: only the accounts posting about one issue (its clustered posts) and/or posts carrying one label.
  const issueId = keyId ? params.get("issue") : null;
  const labelName = keyId ? params.get("label") : null;
  // A watch ("pantauan"): only posts that also mention one of its keywords; it takes the place of the issue filter.
  const watchId = params.get("watch");
  const filter = `${issueId && !watchId ? `&issue=${encodeURIComponent(issueId)}` : ""}${labelName ? `&label=${encodeURIComponent(labelName)}` : ""}${watchId ? `&watch=${encodeURIComponent(watchId)}` : ""}`;
  // With a project or a watch: issues (or the watch) as nodes and the accounts posting in them (default), or who mentions whom.
  const issueView = (!!keyId || !!watchId) && params.get("view") !== "mention";
  // Issue view: how the accounts hang together (direct to the issue, by mention, as a time chain, in waves).
  const flow = parseSnaFlow(params.get("flow"));
  // Drawing style: the classic d3 view, or a Gephi-like map (sigma.js, ForceAtlas2, Louvain clusters).
  const gephi = params.get("gaya") === "gephi";
  const gephiColor: GephiColor = params.get("warna") === "emosi" ? "emosi" : "klaster";
  const gephiSize: GephiSize = params.get("ukuran") === "betweenness" ? "betweenness" : "engagement";
  // "Susun pohon": issues in the first row, their accounts as trees below; accounts tied to no issue at the bottom (or hidden).
  const treeOn = params.get("susun") === "pohon";
  const hideLoose = params.get("lepas") === "sembunyi";
  // Issues cover the last 7 days, so the issue view opens on 7 days unless a period was chosen.
  const days = (params.get("days") ? parseSnaDays(params.get("days")) : null) ?? (issueView ? 7 : DEFAULT_SNA_DAYS);
  const limit = parseSnaLimit(params.get("limit")) ?? DEFAULT_SNA_LIMIT;
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(true);
  const [off, setOff] = useState<Tone[]>([]);
  const [busy, setBusy] = useState(false); // brief loading cover while the graph is rebuilt after an emotion toggle
  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setBusy(false), 700);
    return () => window.clearTimeout(t);
  }, [busy]);
  const [full, setFull] = useState(false);
  const stage = useRef<HTMLElement>(null);
  // In full screen only the stage is shown, so dropdowns open inside it instead of at the end of <body>.
  const portalTarget = full ? stage.current : null;
  const dropdown = { withinPortal: true, zIndex: 400, ...(portalTarget ? { portalProps: { target: portalTarget } } : {}) };
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  // The toolbar may wrap to two rows on narrow screens: what floats under it (the flow guide) follows its height.
  useEffect(() => {
    const el = stage.current, bar = el?.querySelector<HTMLElement>("[role=toolbar]");
    if (!el || !bar) return;
    const ro = new ResizeObserver(() => el.style.setProperty("--bar-h", `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void stage.current?.requestFullscreen(); };

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [params, pathname, router]);

  const keys = useApi<KeyRow[]>("/api/admin/keys");
  const projects = (keys.data ?? []).filter((k) => !k.revokedAt && allowsType(k.scope, "social"));
  const res = useApi<SnaGraph>(`/api/admin/sna?days=${days}&limit=${limit}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}${filter}${issueView ? `&view=isu${flow !== "langsung" ? `&flow=${flow}` : ""}` : ""}`);
  const issues = useApi<{ issues: { id: string; title: string | null; keywords: string[]; posts: number }[] }>(keyId ? `/api/admin/isu-klaster?key=${encodeURIComponent(keyId)}` : null);
  const labels = useApi<{ options: string[]; counts: Record<string, number> }>(keyId ? `/api/admin/keys/${encodeURIComponent(keyId)}/labels` : null);
  const issueOptions = (issues.data?.issues ?? []).map((i) => ({ value: i.id, label: `${i.title ?? i.keywords.slice(0, 3).join(", ")} · ${formatNumber(i.posts)} post` }));
  const labelOptions = (labels.data?.options ?? []).map((l) => ({ value: l, label: `${l} · ${formatNumber(labels.data?.counts[l] ?? 0)}` }));
  const issueTitle = watchId ? undefined : issueOptions.find((o) => o.value === issueId)?.label.replace(/ · [\d.]+ post$/, "");
  const watches = useApi<{ watches: SnaWatch[]; canManage: boolean }>(`/api/admin/sna/watches${keyId ? `?key=${encodeURIComponent(keyId)}` : ""}`);
  const watch = watches.data?.watches.find((w) => w.id === watchId) ?? null;
  const graph = res.data;
  useEffect(() => setPicked(null), [graph]);
  const hubs = useMemo(() => (graph?.nodes ?? []).filter((n) => n.kind === "hub").sort((a, b) => b.posts - a.posts), [graph]);
  useEffect(() => setOff([]), [days, limit, keyId, filter]);
  const view = useMemo(() => (graph ? filterGraph(graph, [...off, "unknown"]) : null), [graph, off]); // posts without an emotion are never drawn
  // Communities and betweenness of the graph on screen (lib/snaNetwork.ts), for the Gephi view and the account panel.
  // Loaded on demand so the classic view does not carry graphology.
  const [network, setNetwork] = useState<{ of: SnaGraph; analysis: NetworkAnalysis } | null>(null);
  useEffect(() => {
    if (!view?.nodes.length) return;
    let stale = false;
    void import("@/lib/snaNetwork").then((m) => { if (!stale) setNetwork({ of: view, analysis: m.analyzeNetwork(view) }); });
    return () => { stale = true; };
  }, [view]);
  const analysis = network?.of === view ? network.analysis : null;
  const tree = useMemo(() => (treeOn && view ? treeLayout(view, gephi ? TREE_COMPACT : TREE_ROOMY) : null), [treeOn, view, gephi]);
  const shown = useMemo(() => (view && tree && hideLoose ? withoutNodes(view, tree.orphans) : view), [view, tree, hideLoose]);
  const canTree = !!view?.nodes.some((n) => n.kind === "issue");
  // Display settings away from their defaults (badge on the Tampilan button).
  const changed = [gephi, gephi && gephiColor !== "klaster", gephi && gephiSize !== "engagement", issueView && flow !== "langsung", limit !== DEFAULT_SNA_LIMIT, off.length > 0].filter(Boolean).length;
  const bridge = analysis && picked ? analysis.bridges.find((b) => b.id === picked) : undefined;
  const node = graph?.nodes.find((n) => n.id === picked) ?? null;
  const periodLabel = SNA_PERIODS.find((p) => p.days === days)!.label;
  const stats = issueView ? [
    { icon: watchId ? IconEye : IconFlame, value: (graph?.nodes ?? []).filter((n) => n.kind === "issue").length, label: watchId ? "pantauan" : "isu" },
    { icon: IconUsers, value: hubs.length, label: "akun" },
    { icon: IconChartDots3, value: (graph?.links ?? []).reduce((n, l) => n + l.n, 0), label: "post" },
  ] : [
    { icon: IconUsersGroup, value: hubs.length, label: "akun utama" },
    { icon: IconUsers, value: (graph?.nodes.length ?? 0) - hubs.length, label: "akun disebut" },
    { icon: IconChartDots3, value: (graph?.links ?? []).reduce((n, l) => n + l.n, 0), label: "mention" },
  ];

  return (
    <div className={classes.page}>

      {res.error && <div className={classes.alert} role="alert"><IconAlertTriangle size={17} />{res.error}<Button size="sm" variant="secondary" onClick={() => void res.reload()}>Coba lagi</Button></div>}

      <section ref={stage} className={classes.stage} data-panel={picked || undefined}>
        <NetworkHeader icon={IconChartDots3} kicker="Analisis jaringan" title="Jaringan sosial" period={`${periodLabel} terakhir`} stats={stats} ready={!!graph}
          focus={watch ? <>Pantauan <b>{watch.name}</b> · {watch.keywords.join(", ")}{labelName && <> · label <b>{labelName}</b></>}</>
            : (issueTitle || labelName) ? <>Akun yang membahas {issueTitle && <>isu <b>{issueTitle}</b></>}{issueTitle && labelName && " dengan "}{labelName && <>label <b>{labelName}</b></>}</> : undefined} />
        <div className={classes.filterBar} role="toolbar" aria-label="Filter jaringan">
          {(keyId || watchId) && <Segmented label="Tampilan" options={VIEW_OPTIONS} value={issueView ? "isu" : "mention"} onChange={(v) => go({ view: v === "isu" ? null : "mention" })} />}
          <Segmented label="Rentang waktu" options={PERIOD_OPTIONS} value={String(days)} onChange={(v) => go({ days: v })} />
          {(!keyLocked || projects.length > 1) && projects.length > 0 && (
            <Select aria-label="Proyek" w={160} allowDeselect={false} classNames={{ input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption }}
              comboboxProps={dropdown} value={keyId ?? ""} onChange={(v) => go({ key: v || null, issue: null, label: null, watch: null })}
              data={[...(keyLocked ? [] : [{ value: "", label: "Nasional" }]), ...projects.map((k) => ({ value: k.id, label: k.name }))]} />
          )}
          {watches.data && (
            <SnaWatchPicker portalTarget={portalTarget} keyId={keyId} watches={watches.data.watches} canManage={watches.data.canManage} value={watchId} onChanged={() => void watches.reload()}
              // A watch's network shows on 7 days by default, like an issue.
              onChange={(v) => go(v ? { watch: v, issue: null, view: null, ...(params.get("days") ? {} : { days: "7" }) } : { watch: null })} />
          )}
          {keyId && !watchId && (
            <Select aria-label="Isu" w={220} clearable searchable placeholder={issueOptions.length ? "Semua isu" : "Belum ada isu"} disabled={!issueOptions.length && !issueId}
              classNames={{ input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption }}
              comboboxProps={dropdown} value={issueId} data={issueOptions}
              // An issue covers the last 7 days of posts, so its whole network shows on the 7-day view.
              onChange={(v) => go(v ? { issue: v, days: "7" } : { issue: null })} />
          )}
          {keyId && (
            <Select aria-label="Label" w={150} clearable placeholder={labelOptions.length ? "Semua label" : "Belum ada label"} disabled={!labelOptions.length && !labelName}
              classNames={{ input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption }}
              comboboxProps={dropdown} value={labelName} data={labelOptions} onChange={(v) => go({ label: v || null })} />
          )}
          <div className={classes.barEnd}>
            <ViewMenu changed={changed}>
              <MenuRow label="Gaya"><Segmented label="Gaya" options={STYLE_OPTIONS} value={gephi ? "gephi" : "klasik"} onChange={(v) => go({ gaya: v === "gephi" ? "gephi" : null })} /></MenuRow>
              {gephi && <MenuRow label="Warna node"><Segmented label="Warna" options={COLOR_OPTIONS} value={gephiColor} onChange={(v) => go({ warna: v === "emosi" ? "emosi" : null })} /></MenuRow>}
              {gephi && <MenuRow label="Ukuran node"><Segmented label="Ukuran node" options={SIZE_OPTIONS} value={gephiSize} onChange={(v) => go({ ukuran: v === "betweenness" ? "betweenness" : null })} /></MenuRow>}
              {issueView && <MenuRow label="Alur"><Segmented label="Alur" options={FLOW_OPTIONS} value={flow} onChange={(v) => go({ flow: v === "langsung" ? null : v })} /></MenuRow>}
              <MenuRow label={issueView ? "Akun per isu" : "Akun teratas"}>
                <Segmented label="Jumlah akun" options={(issueView ? PER_ISSUE_OPTIONS : LIMIT_OPTIONS).map((o) => ({ ...o, label: o.label.replace(/ (akun teratas|akun per isu)$/, "") }))} value={String(limit)} onChange={(v) => go({ limit: v })} />
              </MenuRow>
              <MenuRow label="Emosi">
                <div className={classes.tones} role="group" aria-label="Emosi yang ditampilkan">
                  {TONES.filter((t) => t !== "unknown").map((t) => {
                    const on = !off.includes(t);
                    return (
                      <button key={t} type="button" aria-pressed={on} data-off={!on || undefined} title={on ? `Sembunyikan ${TONE_LABEL[t].toLowerCase()}` : `Tampilkan ${TONE_LABEL[t].toLowerCase()}`}
                        onClick={() => { setOff(on ? [...off, t] : off.filter((x) => x !== t)); setBusy(true); }}>
                        <i style={{ background: TONE_COLOR[t] }} />{TONE_LABEL[t]}
                      </button>
                    );
                  })}
                </div>
              </MenuRow>
            </ViewMenu>
            {graph && graph.nodes.length > 0 && <>
              {canTree && <Tooltip label={treeOn ? "Kembali ke susunan bebas" : "Susun pohon: isu di baris pertama, akunnya di bawah"} withinPortal={false} position="bottom" withArrow>
                <button type="button" className={classes.tool} aria-pressed={treeOn} aria-label="Susun pohon" data-active={treeOn || undefined} onClick={() => go({ susun: treeOn ? null : "pohon", lepas: null })}><IconHierarchy2 size={16} /></button>
              </Tooltip>}
              {tree && tree.orphans.size > 0 && <Tooltip label={hideLoose ? `Tampilkan ${tree.orphans.size} akun tak terikat isu (di bagian bawah)` : `Sembunyikan ${tree.orphans.size} akun tak terikat isu`} withinPortal={false} position="bottom" withArrow>
                <button type="button" className={classes.tool} aria-pressed={hideLoose} aria-label="Sembunyikan akun tak terikat isu" data-active={hideLoose || undefined} onClick={() => go({ lepas: hideLoose ? null : "sembunyi" })}>{hideLoose ? <IconEyeOff size={16} /> : <IconUnlink size={16} />}</button>
              </Tooltip>}
              {!gephi && <Tooltip label={locked ? "Buka kunci graf" : "Kunci graf"} withinPortal={false} position="bottom" withArrow>
                <button type="button" className={classes.tool} aria-pressed={locked} aria-label={locked ? "Buka kunci graf" : "Kunci graf"} data-active={locked || undefined} onClick={() => setLocked(!locked)}>{locked ? <IconLock size={16} /> : <IconLockOpen size={16} />}</button>
              </Tooltip>}
              <Tooltip label={full ? "Keluar layar penuh" : "Layar penuh"} withinPortal={false} position="bottom" withArrow>
                <button type="button" className={classes.tool} aria-label={full ? "Keluar layar penuh" : "Layar penuh"} onClick={toggleFull}>{full ? <IconMinimize size={16} /> : <IconMaximize size={16} />}</button>
              </Tooltip>
            </>}
          </div>
        </div>
        {issueView && graph && graph.nodes.length > 0 && !picked && <SnaFlowGuide flow={flow} onPick={(v) => go({ flow: v === "langsung" ? null : v })} />}
{graph && graph.nodes.length === 0 && <p className={classes.empty}>{watchId ? "Belum ada post yang menyebut kata kunci pantauan ini pada rentang ini. Coba rentang 7 hari atau periksa kata kuncinya." : issueView ? "Belum ada isu dengan post pada rentang ini. Isu dihitung tiap jam; coba rentang 7 hari atau tampilan Mention." : "Belum ada post yang menyebut akun lain pada rentang ini."}</p>}
        {shown && shown.nodes.length > 0 && (gephi
          ? analysis && <GephiGraph graph={shown} analysis={analysis} picked={picked} onPick={setPicked} color={gephiColor} size={gephiSize} layout={tree} />
          : <Graph graph={shown} picked={picked} onPick={setPicked} locked={locked} layout={tree} />)}
        {(res.loading || busy || (!graph && !res.error)) && (
          <div className={classes.loading} data-covering={graph ? "" : undefined} role="status" aria-live="polite">
            <div className={classes.ghost} aria-hidden>
              <i /><i /><i /><i /><i /><i /><i />
            </div>
            <span>Memuat jaringan…</span>
          </div>
        )}
        {graph && graph.nodes.length > 0 && (
          <aside className={classes.legend} aria-label="Legenda">
            {gephi ? <>
              <span><i className={classes.dot} style={{ background: "#a78bfa" }} />Besar = {gephiSize === "betweenness" ? "betweenness (jembatan antar-klaster)" : issueView ? "post (isu) / engagement (akun)" : "engagement dan mention"}</span>
              <span>{gephiColor === "klaster" ? "Warna = klaster (Louvain)" : <><span className={classes.legendTones}>{TONES.filter((t) => t !== "unknown").map((t) => <i key={t} style={{ background: TONE_COLOR[t] }} />)}</span>Warna = emosi dominan</>}</span>
              <span title="Arahkan kursor untuk menyorot tetangga, seret node untuk menata">{tree ? "Susunan pohon" : "Tata letak ForceAtlas2"}</span>
            </> : issueView ? <>
              <span><i className={classes.issueMark}>{watchId ? <IconEye size={10} /> : <IconFlame size={10} />}</i>{watchId ? "Pantauan" : "Isu (besar = jumlah post)"}</span>
              <span><i className={classes.hubMark}><IconUsers size={10} /></i>Akun (besar = engagement)</span>
              <span><i className={classes.lineMark} data-thick /><i className={classes.lineMark} />Tebal = banyak post</span>
              {flow !== "langsung" && <span className={classes.flowNote}>{FLOW_NOTE[flow]}</span>}
            </> : <>
              <span><i className={classes.hubMark}><IconUsers size={10} /></i>Akun utama</span>
              <span><IconMoodSmile size={14} />Akun disebut</span>
              <span><i className={classes.lineMark} data-thick /><i className={classes.lineMark} />Tebal = sering</span>
            </>}
            {!gephi && <>
            <span><i className={classes.kindMark} data-kind="media" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2">${KIND_ICON.media}</svg>` }} />Media berita</span>
            <span><i className={classes.kindMark} data-kind="institusi" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2">${KIND_ICON.institusi}</svg>` }} />Institusi</span>
            <span className={classes.legendTones}>{TONES.filter((t) => t !== "unknown").map((t) => <i key={t} style={{ background: TONE_COLOR[t] }} />)}Warna = emosi</span>
            </>}
            <Tooltip multiline w={290} withArrow position="top-start" withinPortal={false} events={{ hover: true, focus: true, touch: true }}
              label={issueView ? <>
                {watchId
                  ? <><b>Pantauan</b>: semua post yang menyebut salah satu kata kunci pantauan; warna bingkai = emosi dominan.<br /></>
                  : <><b>Isu</b>: kelompok post proyek yang membahas hal yang sama (diperbarui tiap jam); makin besar makin banyak post, warna bingkai = emosi dominan.<br /></>}
                <b>Akun</b>: akun yang memposting di isu itu, paling banyak engagement-nya (suka + 2× komentar + 3× bagikan); makin besar makin tinggi engagement. Akun di beberapa isu menghubungkan isu-isu itu.<br />
                <b>Garis</b>: dari akun ke isu{flow !== "langsung" && " atau ke akun induknya"}; makin tebal makin banyak post-nya, warnanya emosi post tersebut.<br />
                <b>Alur</b>: <i>Langsung</i> = semua akun ke isu. Pada <i>Mention</i>, <i>Rantai waktu</i>, dan <i>Gelombang</i> yang terhubung ke isu adalah akun yang paling awal memposting; akun berikutnya jadi anak: akun lebih awal yang ia sebut/balas (Mention), akun sebelumnya menurut waktu post (Rantai), atau akun paling berpengaruh di gelombang waktu sebelumnya (Gelombang: jam pertama, 1–6 jam, 6–24 jam, 1–3 hari, &gt; 3 hari).<br />
                Emosi bisa disembunyikan lewat tombol warna di panel filter.
              </> : <>
                <b>Akun utama</b>: akun yang paling banyak memposting dan menyebut akun lain; makin besar makin tinggi engagement post-nya, warna bingkai = emosi dominan.<br />
                <b>Akun disebut</b>: wajah berwarna = emosi dominan post yang menyebutnya; makin besar makin tinggi engagement post yang menyebutnya.<br />
                <b>Garis</b>: dari akun utama ke akun yang disebut; makin tebal makin sering disebut, warnanya emosi post tersebut.<br />
                Emosi bisa disembunyikan lewat tombol warna di panel filter.
              </>}>
              <button type="button" className={classes.legendInfo} aria-label="Penjelasan legenda"><IconInfoCircle size={14} /></button>
            </Tooltip>
          </aside>
        )}
        {off.length > 0 && view && view.links.length === 0 && <p className={classes.empty}>Semua emosi disembunyikan.</p>}
        {picked && node && graph && node.kind !== "issue" && <SnaPanel key={picked} node={node} graph={graph} days={days} keyId={keyId} filter={filter} authors={issueView} onPick={setPicked} onClose={() => setPicked(null)}
          bridge={analysis ? { rank: bridge?.rank ?? null, of: analysis.accounts, communities: bridge?.communities.length ?? 0, score: bridge?.score ?? 0 } : undefined} />}
      </section>
    </div>
  );
}
