"use client";
// /analisis/sna — who the most active accounts mention, as a d3 force graph. Line colour = emotion of the posts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconChartDots3, IconChevronDown, IconChevronUp, IconInfoCircle, IconLock, IconLockOpen, IconMaximize, IconMinimize, IconMoodSmile, IconTopologyStar3, IconUsers, IconUsersGroup } from "@tabler/icons-react";
import { drag } from "d3-drag";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { allowsType, type KeyScope } from "@/lib/media/keyScope";
import { formatNumber } from "@/lib/media/labels";
import { dominantTone, filterGraph, DEFAULT_SNA_DAYS, DEFAULT_SNA_LIMIT, parseSnaDays, parseSnaLimit, SNA_LIMITS, SNA_PERIODS, TONE_COLOR, TONE_LABEL, type SnaGraph, type SnaLink, type SnaNode, type Tone } from "@/lib/sna";
import { useApi } from "@/lib/useApi";
import controlClasses from "../media/controls.module.css";
import { Segmented } from "../media/controls";
import { Button } from "../ui/Button";
import { SnaPanel } from "./SnaPanel";
import classes from "./sna.module.css";

type KeyRow = { id: string; name: string; scope: KeyScope; revokedAt: string | null };
type Node = SnaNode & SimulationNodeDatum;
type Edge = Omit<SnaLink, "source" | "target"> & SimulationLinkDatum<Node> & { source: Node; target: Node };
const LIMIT_OPTIONS = SNA_LIMITS.map((n) => ({ value: String(n), label: `Maks. ${n} akun top poster` }));
const PERIOD_OPTIONS = SNA_PERIODS.map((p) => ({ value: String(p.days), label: p.label }));
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
const radius = (n: SnaNode) => (n.kind === "hub" ? 16 + Math.min(18, Math.sqrt(n.posts) * 2) : 5 + Math.min(9, Math.sqrt(n.mentions) * 2));

function Graph({ graph, onPick, picked, locked }: { graph: SnaGraph; onPick: (id: string | null) => void; picked: string | null; locked: boolean }) {
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
    const view = root.append("g");
    const link = view.append("g").selectAll<SVGLineElement, Edge>("line").data(edges).join("line")
      .attr("stroke", (d) => TONE_COLOR[d.tone]).attr("stroke-width", (d) => 1 + Math.sqrt(d.n)).attr("stroke-opacity", 0.9).attr("stroke-linecap", "round").attr("class", classes.flow);
    const node = view.append("g").selectAll<SVGGElement, Node>("g").data(nodes).join("g").attr("data-id", (d) => d.id).style("cursor", "pointer");
    node.append("circle").attr("r", radius).attr("fill", (d) => (d.kind === "hub" ? "#ffffff" : "#1e1b4b")).attr("stroke", (d) => (d.kind === "hub" ? TONE_COLOR[toneOfNode(d.id, "hub")] : TONE_COLOR[toneOfNode(d.id)])).attr("stroke-width", (d) => (d.kind === "hub" ? 4 : 2));
    node.append("g").attr("fill", "none").attr("stroke", (d) => (d.kind === "hub" ? "#2e1065" : TONE_COLOR[toneOfNode(d.id)])).attr("stroke-width", 2).attr("stroke-linecap", "round").attr("stroke-linejoin", "round")
      .attr("transform", (d) => { const k = (radius(d) * (d.kind === "hub" ? 1.15 : toneOfNode(d.id) === "unknown" ? 1.25 : 1.7)) / 24; return `scale(${k}) translate(-12,-12)`; })
      .style("pointer-events", "none").html((d) => (d.kind === "hub" ? ICON.hub : CHILD_ICON[toneOfNode(d.id)]));
    node.filter((d) => d.kind === "hub").append("text").text((d) => d.id).attr("text-anchor", "middle").attr("dy", (d) => -radius(d) - 6).attr("fill", "#ede9fe").attr("font-size", 12).attr("font-weight", 700).style("pointer-events", "none");

    node.filter((d) => d.kind === "child").append("text").text((d) => d.id).attr("text-anchor", "middle").attr("dy", (d) => radius(d) + 11).attr("fill", "#bae6fd").attr("font-size", 9.5).style("pointer-events", "none");
    // A pill behind each name keeps it readable over the lines.
    node.selectAll<SVGTextElement, Node>("text").each((d, i, els) => {
      const t = els[i], b = t.getBBox();
      select(t.parentNode as SVGGElement).insert("rect", () => t).attr("x", b.x - 4).attr("y", b.y - 1).attr("width", b.width + 8).attr("height", b.height + 2).attr("rx", 5)
        .attr("fill", d.kind === "hub" ? "rgba(46,16,101,.85)" : "rgba(15,13,36,.78)").style("pointer-events", "none");
    });
    const tipEl = tip.current!;
    const place = (e: MouseEvent) => { const r = wrap.getBoundingClientRect(); tipEl.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`; };
    const text = (s: string) => Object.assign(document.createElement("span"), { textContent: s });
    node.on("mousemove", (e: MouseEvent, d) => {
      tipEl.replaceChildren();
      const b = document.createElement("b"); b.textContent = `@${d.id}`; tipEl.append(b, text(d.kind === "hub" ? `Top poster · ${formatNumber(d.posts)} post · ${formatNumber(d.mentions)} mention` : `Disebut ${formatNumber(d.mentions)}×`), text(`Emosi dominan: ${TONE_LABEL[toneOfNode(d.id, d.kind)]}`), text("Klik untuk detail"));
      tipEl.dataset.on = "1"; place(e);
    }).on("mouseleave", () => delete tipEl.dataset.on).on("click", (e: MouseEvent, d) => { e.stopPropagation(); pickRef.current(d.id); });
    link.on("mousemove", (e: MouseEvent, d) => {
      tipEl.replaceChildren();
      const b = document.createElement("b"); b.textContent = `@${d.source.id} → @${d.target.id} · ${d.n}×`; tipEl.append(b);
      for (const t of TONES) if (d.counts[t]) tipEl.append(text(`${TONE_LABEL[t]}: ${d.counts[t]}`));
      tipEl.dataset.on = "1"; place(e);
    }).on("mouseleave", () => delete tipEl.dataset.on);
    root.on("click", () => pickRef.current(null));

    const sim = forceSimulation<Node>(nodes)
      .force("link", forceLink<Node, Edge>(edges).id((d) => d.id).distance((d) => 90 + radius(d.source)).strength(0.7))
      .force("charge", forceManyBody<Node>().strength((d) => (d.kind === "hub" ? -500 : -45)))
      .force("collide", forceCollide<Node>().radius((d) => radius(d) + 6))
      .on("tick", () => paint());
    const paint = () => {
      link.attr("x1", (d) => d.source.x!).attr("y1", (d) => d.source.y!).attr("x2", (d) => d.target.x!).attr("y2", (d) => d.target.y!);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    };
    simRef.current = sim;
    sim.stop();
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 4]).on("zoom", (e) => view.attr("transform", e.transform.toString()))
      .filter((e) => !lockedRef.current && (!e.target.closest?.("[data-id]") || e.type === "wheel"));
    root.call(z);
    // Pan and zoom so every node is in view (called whenever the layout is rebuilt, e.g. after switching an emotion off).
    const fitView = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const xs = nodes.map((n) => n.x ?? 0), ys = nodes.map((n) => n.y ?? 0);
      const x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 60, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
      const k = Math.min(1.4, Math.max(0.3, Math.min(width / (x1 - x0), height / (y1 - y0))));
      root.call(z.transform, zoomIdentity.translate(width / 2 - (k * (x0 + x1)) / 2, height / 2 - (k * (y0 + y1)) / 2).scale(k));
    };
    // The graph fades in once it is arranged and framed, so nodes do not jump around on screen.
    el.style.transition = "none";
    el.style.opacity = "0";
    let timer = 0;
    const reveal = () => requestAnimationFrame(() => { el.style.transition = "opacity 450ms ease"; el.style.opacity = "1"; });
    const fit = () => {
      const { width, height } = wrap.getBoundingClientRect();
      // Hubs sit on a ring so their clusters stay apart; children are only pulled loosely to the middle.
      const hubs = nodes.filter((n) => n.kind === "hub"), ring = Math.min(width, height) * 0.36, cy = height / 2 + 20;
      const at = (d: Node) => { const i = hubs.indexOf(d); const a = (i / hubs.length) * 2 * Math.PI - Math.PI / 2; return i < 0 ? null : [width / 2 + ring * Math.cos(a), cy + ring * Math.sin(a)]; };
      sim.force("x", forceX<Node>((d) => at(d)?.[0] ?? width / 2).strength((d) => (d.kind === "hub" ? 0.25 : 0.015)))
        .force("y", forceY<Node>((d) => at(d)?.[1] ?? cy).strength((d) => (d.kind === "hub" ? 0.25 : 0.015))).alpha(0.5);
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
      .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    return () => { window.clearTimeout(timer); sim.stop(); ro.disconnect(); root.on(".zoom", null).selectAll("*").remove(); };
  }, [graph]);

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
  const days = parseSnaDays(params.get("days")) ?? DEFAULT_SNA_DAYS;
  const limit = parseSnaLimit(params.get("limit")) ?? DEFAULT_SNA_LIMIT;
  const [picked, setPicked] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
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
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void stage.current?.requestFullscreen(); };

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [params, pathname, router]);

  const keys = useApi<KeyRow[]>("/api/admin/keys");
  const projects = (keys.data ?? []).filter((k) => !k.revokedAt && allowsType(k.scope, "social"));
  const res = useApi<SnaGraph>(`/api/admin/sna?days=${days}&limit=${limit}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`);
  const graph = res.data;
  useEffect(() => setPicked(null), [graph]);
  const hubs = useMemo(() => (graph?.nodes ?? []).filter((n) => n.kind === "hub").sort((a, b) => b.posts - a.posts), [graph]);
  useEffect(() => setOff([]), [days, limit, keyId]);
  const view = useMemo(() => (graph ? filterGraph(graph, [...off, "unknown"]) : null), [graph, off]); // posts without an emotion are never drawn
  const node = graph?.nodes.find((n) => n.id === picked) ?? null;
  const periodLabel = SNA_PERIODS.find((p) => p.days === days)!.label;
  const stats = [
    { icon: IconUsersGroup, value: hubs.length, label: "akun utama" },
    { icon: IconUsers, value: (graph?.nodes.length ?? 0) - hubs.length, label: "akun disebut" },
    { icon: IconChartDots3, value: (graph?.links ?? []).reduce((n, l) => n + l.n, 0), label: "mention" },
  ];

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <IconChartDots3 className={classes.heroIcon} size={150} stroke={1} aria-hidden />
        <div className={classes.heroText}>
          <span className={classes.badge}><IconTopologyStar3 size={13} />Analisis jaringan</span>
          <h1>Jaringan sosial <em>{periodLabel}</em> terakhir</h1>
        </div>
        <div className={classes.stats}>
          {stats.map((x) => <div key={x.label}><x.icon size={16} aria-hidden /><b>{graph ? formatNumber(x.value) : "—"}</b><span>{x.label}</span></div>)}
        </div>
      </header>

      <div className={classes.toolbar}>
        <Segmented label="Rentang waktu" options={PERIOD_OPTIONS} value={String(days)} onChange={(v) => go({ days: v })} />
        <Select aria-label="Maksimal akun top poster" w={250} allowDeselect={false} classNames={{ input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption }}
          comboboxProps={{ withinPortal: true, zIndex: 400 }} value={String(limit)} onChange={(v) => go({ limit: v })} data={LIMIT_OPTIONS} />
        {(!keyLocked || projects.length > 1) && projects.length > 0 && (
          <Select aria-label="Proyek" w={220} allowDeselect={false} classNames={{ input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption }}
            comboboxProps={{ withinPortal: true, zIndex: 400 }} value={keyId ?? ""} onChange={(v) => go({ key: v || null })}
            data={[...(keyLocked ? [] : [{ value: "", label: "Nasional" }]), ...projects.map((k) => ({ value: k.id, label: k.name }))]} />
        )}
      </div>

      {res.error && <div className={classes.alert} role="alert"><IconAlertTriangle size={17} />{res.error}<Button size="sm" variant="secondary" onClick={() => void res.reload()}>Coba lagi</Button></div>}

      <section ref={stage} className={classes.stage} data-panel={picked || undefined}>
        {graph && graph.nodes.length > 0 && (
          <div className={classes.tools}>
            <Tooltip label={locked ? "Buka kunci graf" : "Kunci graf"} withinPortal={false} position="bottom" withArrow>
            <button type="button" aria-pressed={locked} aria-label={locked ? "Buka kunci graf" : "Kunci graf"} data-active={locked || undefined} onClick={() => setLocked(!locked)}>
              {locked ? <IconLock size={17} /> : <IconLockOpen size={17} />}
            </button>
            </Tooltip>
            <Tooltip label={full ? "Keluar layar penuh" : "Layar penuh"} withinPortal={false} position="bottom" withArrow>
            <button type="button" aria-label={full ? "Keluar layar penuh" : "Layar penuh"} onClick={toggleFull}>
              {full ? <IconMinimize size={17} /> : <IconMaximize size={17} />}
            </button>
            </Tooltip>
          </div>
        )}
                {graph && graph.nodes.length === 0 && <p className={classes.empty}>Belum ada post yang menyebut akun lain pada rentang ini.</p>}
        {view && view.nodes.length > 0 && <Graph graph={view!} picked={picked} onPick={setPicked} locked={locked} />}
        {(res.loading || busy || (!graph && !res.error)) && (
          <div className={classes.loading} data-covering={graph ? "" : undefined} role="status" aria-live="polite">
            <div className={classes.ghost} aria-hidden>
              <i /><i /><i /><i /><i /><i /><i />
            </div>
            <span>Memuat jaringan…</span>
          </div>
        )}
        {graph && graph.nodes.length > 0 && (
          <aside className={classes.legendBox} data-open={legendOpen || undefined}>
            <button type="button" className={classes.legendToggle} aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}>
              <IconInfoCircle size={15} />Legenda{legendOpen ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
            </button>
            {legendOpen && (
              <ul>
                <li className={classes.legendHead}>Warna = emosi postingan (klik toggle untuk menyembunyikan)</li>
                {TONES.filter((t) => t !== "unknown").map((t) => {
                  const on = !off.includes(t);
                  return (
                    <li key={t} data-off={!on || undefined}>
                      <i className={classes.swatch} style={{ background: TONE_COLOR[t] }} />{TONE_LABEL[t]}
                      <button type="button" role="switch" aria-checked={on} aria-label={`Tampilkan ${TONE_LABEL[t]}`} className={classes.switch} onClick={() => { setOff(on ? [...off, t] : off.filter((x) => x !== t)); setBusy(true); }} />
                    </li>
                  );
                })}
                <li className={classes.legendHead}>Simpul</li>
                <li className={classes.legendNote}><IconUsers size={16} /><span><b>Akun top poster</b>: lingkaran putih, border = emosi dominan postingannya.</span></li>
                <li className={classes.legendNote}><IconMoodSmile size={16} /><span><b>Akun yang disebut</b>: wajah = emosi dominan post yang menyebutnya.</span></li>
                <li className={classes.legendHead}>Garis</li>
                <li className={classes.legendNote}><span>Makin tebal = makin sering disebut. Garis bergerak dari top poster ke akun yang disebut.</span></li>
              </ul>
            )}
          </aside>
        )}
        {off.length > 0 && view && view.links.length === 0 && <p className={classes.empty}>Semua emosi disembunyikan.</p>}
        {picked && node && graph && <SnaPanel key={picked} node={node} graph={graph} days={days} keyId={keyId} onPick={setPicked} onClose={() => setPicked(null)} />}
      </section>
    </div>
  );
}
