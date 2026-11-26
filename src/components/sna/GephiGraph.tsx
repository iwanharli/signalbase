"use client";
// SNA "Gephi" mode: the same graph drawn like a Gephi map with sigma.js (WebGL): ForceAtlas2 layout, communities found
// with Louvain coloured as clusters (or nodes coloured by emotion), the hovered or picked node with its neighbours lit.
// Loaded only in the browser (next/dynamic, ssr: false): sigma needs WebGL.
import { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { dominantTone, TONE_COLOR, type SnaGraph, type Tone } from "@/lib/sna";
import { formatNumber } from "@/lib/media/labels";
import classes from "./sna.module.css";

export type GephiColor = "klaster" | "emosi";
type NodeAttrs = { label: string; full: string; x: number; y: number; size: number; color: string; community: number; kind: string };
/** Long issue titles are cut on the map; the whole title shows when the node is lit. */
const short = (t: string) => (t.length > 42 ? `${t.slice(0, 40).trimEnd()}…` : t);

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

/** Small seeded random numbers, so the same graph always gets the same layout and clusters. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export function GephiGraph({ graph, picked, onPick, color }: { graph: SnaGraph; picked: string | null; onPick: (id: string | null) => void; color: GephiColor }) {
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
    for (const n of graph.nodes) {
      const size = n.kind === "issue" ? 16 + 10 * Math.log1p(weight(n)) / Math.log1p(maxW) : 3 + 11 * Math.log1p(weight(n)) / Math.log1p(maxW);
      const a = rand() * Math.PI * 2, r = 10 + rand() * 90;
      const full = n.kind === "issue" ? (n.title ?? "Isu") : `@${n.id}`;
      g.addNode(n.id, { label: short(full), full, x: Math.cos(a) * r, y: Math.sin(a) * r, size, color: OTHER, community: -1, kind: n.kind });
    }
    for (const l of graph.links) {
      if (!g.hasNode(l.source) || !g.hasNode(l.target) || l.source === l.target) continue;
      const key = l.source < l.target ? `${l.source}\u0000${l.target}` : `${l.target}\u0000${l.source}`;
      const w = (g.hasEdge(key) ? (g.getEdgeAttribute(key, "weight") as number) : 0) + l.n;
      g.mergeEdgeWithKey(key, l.source, l.target, { weight: w, tone: dominantTone(l.counts), size: Math.min(4, 0.6 + Math.log1p(w) * 0.6), color: TONE_COLOR[dominantTone(l.counts)] + "55" });
    }
    if (g.size) louvain.assign(g, { nodeCommunityAttribute: "community", getEdgeWeight: "weight", rng: seeded(42) });
    // ForceAtlas2 like Gephi's defaults for the graph's size, a little more gravity so clusters stay on screen.
    const settings = { ...forceAtlas2.inferSettings(g), gravity: 1.2, scalingRatio: 8, adjustSizes: false, edgeWeightInfluence: 0.6 };
    forceAtlas2.assign(g, { iterations: g.order > 400 ? 250 : 400, settings, getEdgeWeight: "weight" });

    // The biggest communities get palette colours; the rest share one grey.
    const members = new Map<number, string[]>();
    g.forEachNode((id, a) => members.set(a.community, [...(members.get(a.community) ?? []), id]));
    const ranked = [...members].sort((x, y) => y[1].length - x[1].length);
    const colorOf = new Map<number, string>(ranked.map(([c], i) => [c, i < PALETTE.length && ranked[i][1].length > 1 ? PALETTE[i] : OTHER]));
    const legend = ranked.slice(0, 6).filter(([, ids]) => ids.length > 1).map(([c, ids]) => {
      const lead = [...ids].sort((x, y) => g.getNodeAttribute(y, "size") - g.getNodeAttribute(x, "size"))[0];
      return { color: colorOf.get(c)!, lead: g.getNodeAttribute(lead, "label"), n: ids.length };
    });
    return { g, colorOf, tones, legend };
  }, [graph]);

  // Node colours follow the chosen colouring.
  useEffect(() => {
    const { g, colorOf, tones } = built;
    g.forEachNode((id, a) => {
      const t = tones.get(id);
      g.setNodeAttribute(id, "color", color === "emosi" ? TONE_COLOR[t ? dominantTone(t) : "unknown"] : colorOf.get(a.community) ?? OTHER);
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
    el.style.top = `${(stage?.querySelector<HTMLElement>("[role=toolbar]")?.offsetHeight ?? 0) + 12}px`;
    el.style.bottom = `${(stage?.querySelector<HTMLElement>("aside[aria-label=Legenda]")?.offsetHeight ?? 0) + 16}px`;
    const neighbours = (id: string | null) => (id && g.hasNode(id) ? new Set([id, ...g.neighbors(id)]) : null);
    const lit = () => neighbours(hoverRef.current ?? pickedRef.current);
    const sigma = new Sigma<NodeAttrs>(g, el, {
      renderEdgeLabels: false,
      labelColor: { color: "#ece8ff" },
      labelFont: "Inter, system-ui, sans-serif",
      labelWeight: "600",
      labelSize: 12,
      labelRenderedSizeThreshold: 7,
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
    return () => { sigma.kill(); sigmaRef.current = null; };
  }, [built]);

  useEffect(() => { pickedRef.current = picked; sigmaRef.current?.refresh({ skipIndexation: true }); }, [picked]);

  const stats = useMemo(() => `${formatNumber(built.g.order)} node · ${formatNumber(built.g.size)} hubungan`, [built]);
  return (
    <>
      <div ref={box} className={classes.gephi} role="img" aria-label="Graf jaringan akun, mode Gephi" />
      {clusters.length > 0 && (
        <aside className={classes.clusters} aria-label="Klaster">
          <b>Klaster komunitas</b>
          {clusters.map((c) => <span key={c.lead}><i style={{ background: c.color }} /><em title={c.lead}>{c.lead}</em><small>{c.n} node</small></span>)}
          <small>{stats}</small>
        </aside>
      )}
    </>
  );
}
