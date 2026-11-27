"use client";
// SNA "Gephi" mode: the same graph drawn like a Gephi map with sigma.js (WebGL): ForceAtlas2 layout, communities found
// with Louvain coloured as clusters (or nodes coloured by emotion), the hovered or picked node with its neighbours lit.
// Loaded only in the browser (next/dynamic, ssr: false): sigma needs WebGL.
import { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { dominantTone, KIND_COLOR, TONE_COLOR, type SnaGraph, type Tone } from "@/lib/sna";
import { formatNumber } from "@/lib/media/labels";
import { seeded, type NetworkAnalysis } from "@/lib/snaNetwork";
import type { TreeLayout } from "@/lib/snaTree";
import classes from "./sna.module.css";

/** klaster: Louvain communities; emosi: the tone of each node's links; jenis: by node type (see KIND_COLOR). */
export type GephiColor = "klaster" | "emosi" | "jenis";
/** Node size: engagement (posts for issues), or betweenness: the bridges between groups stand out. */
export type GephiSize = "engagement" | "betweenness";
type NodeAttrs = { label: string; full: string; x: number; y: number; fx: number; fy: number; size: number; eng: number; btw: number; color: string; community: number; kind: string };
/** Long issue titles are cut on the map; the whole title shows when the node is lit. */
const short = (t: string, max = 42) => (t.length > max ? `${t.slice(0, max - 2).trimEnd()}…` : t);

// Distinct cluster colours that read on the dark stage (Gephi-like).
const PALETTE = ["#a78bfa", "#22d3ee", "#f472b6", "#facc15", "#4ade80", "#fb923c", "#60a5fa", "#f87171", "#2dd4bf", "#c084fc", "#a3e635", "#fbbf24"];
const OTHER = "#64748b";
const DIM_NODE = "#2a2747", DIM_EDGE = "#1f1c38";

/** The hovered node: a ring in its colour and its label on a dark pill (sigma's default is a white box). */
function drawHover(ctx: CanvasRenderingContext2D, data: { x: number; y: number; size: number; label?: string | null; color: string }) {
  ctx.beginPath();
  ctx.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
  ctx.strokeStyle = data.color; ctx.lineWidth = 2; ctx.stroke();
  if (!data.label) return;
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  const w = ctx.measureText(data.label).width, h = 20, x = data.x + data.size + 6, y = data.y - h / 2;
  ctx.fillStyle = "rgba(15,13,36,.94)";
  ctx.beginPath(); ctx.roundRect(x - 6, y, w + 12, h, 6); ctx.fill();
  ctx.strokeStyle = "rgba(167,139,250,.5)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(data.label, x, data.y + 0.5);
}


/** Room between two nodes, in screen pixels. */
const NODE_GAP = 6;

/**
 * Pushes overlapping nodes apart. Sigma fits the whole graph into the box and draws sizes in screen pixels, so the
 * distance two nodes need is converted to graph units through the graph's extent. A spatial grid keeps it near-linear;
 * a few rounds settle chains of collisions. `rowsFixed` (tree): only sideways, so the rows stay rows.
 */
function separate(g: Graph<NodeAttrs>, boxPx: number, rowsFixed: boolean) {
  const ids = g.nodes();
  if (ids.length < 2) return;
  for (let round = 0; round < 8; round++) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxSize = 0;
    for (const id of ids) {
      const a = g.getNodeAttributes(id);
      minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x); minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
      maxSize = Math.max(maxSize, a.size);
    }
    const unit = Math.max(maxX - minX, maxY - minY, 1e-6) / Math.max(160, boxPx - 60); // graph units per screen pixel
    const cell = (2 * maxSize + NODE_GAP) * unit;
    const grid = new Map<string, string[]>();
    for (const id of ids) {
      const a = g.getNodeAttributes(id);
      const key = `${Math.floor(a.x / cell)}|${Math.floor(a.y / cell)}`;
      grid.set(key, [...(grid.get(key) ?? []), id]);
    }
    let moved = false;
    for (const id of ids) {
      const a = g.getNodeAttributes(id);
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${cx + dx}|${cy + dy}`) ?? []) {
          if (other <= id) continue;
          const b = g.getNodeAttributes(other);
          const need = (a.size + b.size + NODE_GAP) * unit;
          let vx = b.x - a.x, vy = rowsFixed ? 0 : b.y - a.y;
          if (rowsFixed && Math.abs(b.y - a.y) >= need) continue;
          let d = Math.hypot(vx, vy);
          if (d >= need) continue;
          // Same spot: a fixed direction from the ids, so the result does not change between renders.
          if (d < 1e-9) { const t = (id.length * 31 + other.length * 17) % 360 * Math.PI / 180; vx = rowsFixed ? 1 : Math.cos(t); vy = rowsFixed ? 0 : Math.sin(t); d = 1; }
          const push = (need - d) / 2 / d;
          a.x -= vx * push; b.x += vx * push;
          if (!rowsFixed) { a.y -= vy * push; b.y += vy * push; }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

export function GephiGraph({ graph, analysis, picked, onPick, color, size, layout = null, bridgeTitle = "Akun jembatan", tidy = 0 }: {
  graph: SnaGraph; analysis: NetworkAnalysis; picked: string | null; onPick: (id: string | null) => void; color: GephiColor; size: GephiSize;
  /** "Susun pohon": fixed positions instead of ForceAtlas2. */
  layout?: TreeLayout | null;
  /** Heading of the bridge list ("Akun jembatan"; other networks name their nodes differently). */
  bridgeTitle?: string;
  /** Bumped by a "Rapikan node" button: dragged nodes go back to the layout, apart and centred. */
  tidy?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma<NodeAttrs> | null>(null);
  const hoverRef = useRef<string | null>(null);
  const pickedRef = useRef(picked);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [clusters, setClusters] = useState<{ color: string; lead: string; n: number }[]>([]);

  // Build the graphology graph, its clusters and its layout once per data set.
  const built = useMemo(() => {
    const g = new Graph<NodeAttrs>({ type: "undirected", multi: false });
    const rand = seeded(graph.nodes.length * 7919 + graph.links.length);
    const tones = new Map<string, Record<Tone, number>>();
    const addTone = (id: string, c: Record<Tone, number>) => {
      const t = tones.get(id) ?? { negative: 0, neutral: 0, positive: 0, unknown: 0 };
      for (const k of Object.keys(c) as Tone[]) t[k] += c[k];
      tones.set(id, t);
    };
    for (const l of graph.links) { addTone(l.source, l.counts); addTone(l.target, l.counts); }
    const weight = (n: SnaGraph["nodes"][number]) => n.kind === "issue" ? n.posts * 40 : (n.engagement ?? 0) + n.posts + n.mentions;
    const maxW = Math.max(1, ...graph.nodes.map(weight));
    const maxB = Math.max(1e-9, ...analysis.betweenness.values());
    for (const n of graph.nodes) {
      const eng = n.kind === "issue" ? 16 + 10 * Math.log1p(weight(n)) / Math.log1p(maxW) : 3 + 11 * Math.log1p(weight(n)) / Math.log1p(maxW);
      // Betweenness on a square-root scale: a few bridges are far above the rest, which would leave everyone else a dot.
      const btw = 3 + 19 * Math.sqrt((analysis.betweenness.get(n.id) ?? 0) / maxB);
      const a = rand() * Math.PI * 2, r = 10 + rand() * 90;
      const full = n.kind === "issue" ? (n.title ?? "Isu") : n.name ?? `@${n.id}`;
      g.addNode(n.id, { label: short(full), full, x: Math.cos(a) * r, y: Math.sin(a) * r, fx: 0, fy: 0, size: eng, eng, btw, color: OTHER, community: analysis.community.get(n.id) ?? -1, kind: n.kind });
    }
    for (const l of graph.links) {
      if (!g.hasNode(l.source) || !g.hasNode(l.target) || l.source === l.target) continue;
      const key = l.source < l.target ? `${l.source}\u0000${l.target}` : `${l.target}\u0000${l.source}`;
      const w = (g.hasEdge(key) ? (g.getEdgeAttribute(key, "weight") as number) : 0) + l.n;
      g.mergeEdgeWithKey(key, l.source, l.target, { weight: w, tone: dominantTone(l.counts), size: Math.min(4, 0.6 + Math.log1p(w) * 0.6), color: TONE_COLOR[dominantTone(l.counts)] + "55" });
    }
    // ForceAtlas2 like Gephi's defaults for the graph's size, a little more gravity so clusters stay on screen.
    const settings = { ...forceAtlas2.inferSettings(g), gravity: 1.2, scalingRatio: 8, adjustSizes: false, edgeWeightInfluence: 0.6 };
    forceAtlas2.assign(g, { iterations: g.order > 400 ? 250 : 400, settings, getEdgeWeight: "weight" });
    g.forEachNode((id, a) => g.mergeNodeAttributes(id, { fx: a.x, fy: a.y })); // the ForceAtlas2 places, to go back to

    // The biggest communities get palette colours; the rest share one grey.
    const members = new Map<number, string[]>();
    g.forEachNode((id, a) => members.set(a.community, [...(members.get(a.community) ?? []), id]));
    const ranked = [...members].sort((x, y) => y[1].length - x[1].length);
    const colorOf = new Map<number, string>(ranked.map(([c], i) => [c, i < PALETTE.length && ranked[i][1].length > 1 ? PALETTE[i] : OTHER]));
    const legend = ranked.slice(0, 6).filter(([, ids]) => ids.length > 1).map(([c, ids]) => {
      const lead = [...ids].sort((x, y) => g.getNodeAttribute(y, "eng") - g.getNodeAttribute(x, "eng"))[0];
      return { color: colorOf.get(c)!, lead: g.getNodeAttribute(lead, "label"), n: ids.length };
    });
    return { g, colorOf, tones, legend };
  }, [graph, analysis]);

  // Positions (the tree's, sigma's y axis pointing up, or ForceAtlas2's) and sizes (the chosen measure), then nodes pushed
  // apart so none overlaps on screen, whatever the layout, size measure or filter.
  useEffect(() => {
    const { g } = built;
    g.forEachNode((id, a) => {
      const p = layout?.pos.get(id);
      // In the tree the issues stand side by side in one row: their titles are cut shorter so they do not run together.
      const label = a.kind === "issue" ? short(a.full, layout ? 16 : 42) : a.label;
      g.mergeNodeAttributes(id, { ...(p ? { x: p.x, y: -p.y } : { x: a.fx, y: a.fy }), label, size: size === "betweenness" ? a.btw : a.eng });
    });
    separate(g, Math.min(box.current?.clientWidth || 900, box.current?.clientHeight || 600), !!layout);
    sigmaRef.current?.refresh();
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  }, [built, layout, size, tidy]);

  // Node colours follow the chosen colouring.
  useEffect(() => {
    const { g, colorOf, tones } = built;
    g.forEachNode((id, a) => {
      const t = tones.get(id);
      g.setNodeAttribute(id, "color", color === "emosi" ? TONE_COLOR[t ? dominantTone(t) : "unknown"]
        : color === "jenis" ? KIND_COLOR[a.kind as keyof typeof KIND_COLOR] ?? OTHER : colorOf.get(a.community) ?? OTHER);
    });
    setClusters(color === "klaster" ? built.legend : []);
    sigmaRef.current?.refresh();
  }, [built, color]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const { g } = built;
    // Frame the graph between the floating filter bar (top) and the legend (bottom).
    const stage = el.closest("section");
    const bar = stage?.querySelector<HTMLElement>("[role=toolbar]");
    el.style.top = `${(bar ? bar.offsetTop + bar.offsetHeight : 0) + 12}px`;
    el.style.bottom = `${(stage?.querySelector<HTMLElement>("aside[aria-label=Legenda]")?.offsetHeight ?? 0) + 16}px`;
    const neighbours = (id: string | null) => (id && g.hasNode(id) ? new Set([id, ...g.neighbors(id)]) : null);
    const lit = () => neighbours(hoverRef.current ?? pickedRef.current);
    const sigma = new Sigma<NodeAttrs>(g, el, {
      renderEdgeLabels: false,
      labelColor: { color: "#ece8ff" },
      labelFont: "Inter, system-ui, sans-serif",
      labelWeight: "600",
      labelSize: 12,
      // Small maps (an ontology, a small issue) name every node; big ones only the larger nodes, so labels do not pile up.
      labelRenderedSizeThreshold: g.order <= 80 ? 0 : 7,
      labelDensity: 0.9,
      defaultEdgeType: "line",
      zIndex: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 4,
      stagePadding: 24,
      defaultDrawNodeHover: drawHover,
      nodeReducer: (node, data) => {
        const on = lit();
        if (!on) return data;
        const focus = node === (hoverRef.current ?? pickedRef.current);
        return on.has(node) ? { ...data, zIndex: 2, forceLabel: true, highlighted: focus, label: focus ? g.getNodeAttribute(node, "full") : data.label } : { ...data, color: DIM_NODE, label: "", zIndex: 0 };
      },
      edgeReducer: (edge, data) => {
        const on = lit();
        if (!on) return data;
        const [a, b] = g.extremities(edge);
        return on.has(a) && on.has(b) && (a === (hoverRef.current ?? pickedRef.current) || b === (hoverRef.current ?? pickedRef.current))
          ? { ...data, color: TONE_COLOR[(g.getEdgeAttribute(edge, "tone") as Tone) ?? "unknown"], size: (data.size ?? 1) + 0.8, zIndex: 1 }
          : { ...data, color: DIM_EDGE };
      },
    });
    sigmaRef.current = sigma;

    // Issue nodes drawn apart from accounts: a soft glow, a white and a dashed ring, and an "ISU" tag above, redrawn with
    // every frame on a canvas over sigma's own (added after sigma, so it sits on top; sigma itself draws plain discs).
    const canvas = document.createElement("canvas");
    canvas.className = classes.gephiOverlay;
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);
    const paintIssues = () => {
      const ratio = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const on = lit();
      g.forEachNode((id, a) => {
        if (a.kind !== "issue") return;
        const d = sigma.getNodeDisplayData(id);
        if (!d || d.hidden) return;
        const p = sigma.framedGraphToViewport({ x: d.x, y: d.y });
        const r = sigma.scaleSize(d.size);
        const dim = !!on && !on.has(id);
        ctx.globalAlpha = dim ? 0.25 : 1;
        const glow = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 2.1);
        glow.addColorStop(0, "rgba(251,113,133,.45)"); glow.addColorStop(1, "rgba(251,113,133,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = "#fb7185"; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = "800 10px Inter, system-ui, sans-serif";
        const tag = "ISU", tw = ctx.measureText(tag).width + 14, ty = p.y - r - 22;
        const grad = ctx.createLinearGradient(p.x - tw / 2, 0, p.x + tw / 2, 0);
        grad.addColorStop(0, "#f43f5e"); grad.addColorStop(1, "#7c3aed");
        ctx.fillStyle = grad; ctx.beginPath(); ctx.roundRect(p.x - tw / 2, ty, tw, 16, 8); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(tag, p.x, ty + 8.5);
        ctx.globalAlpha = 1;
      });
    };
    sigma.on("afterRender", paintIssues);

    // Hover lights a node and its neighbours; click opens it (as in the classic view); dragging moves it.
    let dragged: string | null = null, moved = false;
    sigma.on("enterNode", ({ node }) => { hoverRef.current = node; el.style.cursor = "pointer"; sigma.refresh({ skipIndexation: true }); });
    sigma.on("leaveNode", () => { hoverRef.current = null; el.style.cursor = ""; sigma.refresh({ skipIndexation: true }); });
    sigma.on("downNode", ({ node }) => { dragged = node; moved = false; });
    sigma.on("moveBody", ({ event }) => {
      if (!dragged) return;
      moved = true;
      const pos = sigma.viewportToGraph(event);
      g.setNodeAttribute(dragged, "x", pos.x);
      g.setNodeAttribute(dragged, "y", pos.y);
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });
    const release = () => { dragged = null; };
    sigma.on("upNode", release);
    sigma.on("upStage", release);
    sigma.on("clickNode", ({ node }) => { if (!moved) pickRef.current(node); });
    sigma.on("clickStage", () => pickRef.current(null));
    return () => { sigma.kill(); canvas.remove(); sigmaRef.current = null; };
  }, [built]);

  useEffect(() => { pickedRef.current = picked; sigmaRef.current?.refresh({ skipIndexation: true }); }, [picked]);

  const stats = useMemo(() => `${formatNumber(built.g.order)} node · ${formatNumber(built.g.size)} hubungan`, [built]);
  const bridges = analysis.bridges.slice(0, 6);
  return (
    <>
      <div ref={box} className={classes.gephi} role="img" aria-label="Graf jaringan akun, mode Gephi" />
      {size === "betweenness" ? bridges.length > 0 && (
        <aside className={classes.clusters} aria-label="Akun jembatan">
          <b>{bridgeTitle}</b>
          {bridges.map((br) => (
            <button key={br.id} type="button" className={classes.bridgeRow} onClick={() => onPick(br.id)} title={`Betweenness ${br.score.toFixed(3)} · menghubungkan ${br.communities.length} klaster`}>
              <span className={classes.bridgeRank}>{br.rank}</span>
              <em>{built.g.hasNode(br.id) ? built.g.getNodeAttribute(br.id, "full") : `@${br.id}`}</em>
              <span className={classes.bridgeDots}>{br.communities.slice(0, 5).map((c) => <i key={c} style={{ background: built.colorOf.get(c) ?? OTHER }} />)}</span>
            </button>
          ))}
          <small>Titik = klaster yang dihubungkan · {stats}</small>
        </aside>
      ) : clusters.length > 0 && (
        <aside className={classes.clusters} aria-label="Klaster">
          <b>Klaster komunitas</b>
          {clusters.map((c) => <span key={c.lead}><i style={{ background: c.color }} /><em title={c.lead}>{c.lead}</em><small>{c.n} node</small></span>)}
          <small>{stats}</small>
        </aside>
      )}
    </>
  );
}
