"use client";
// /analisis/ontologi — early-warning issues and the actors / targets they name, as a d3 force graph (same layout as /analisis/sna).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconChevronDown, IconChevronUp, IconFlame, IconHierarchy2, IconInfoCircle, IconLock, IconLockOpen, IconMaximize, IconMinimize, IconTarget, IconUsers } from "@tabler/icons-react";
import { drag } from "d3-drag";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { allowsType, type KeyScope } from "@/lib/media/keyScope";
import { formatNumber } from "@/lib/media/labels";
import { buildOntologi, DEFAULT_ONT_DAYS, filterLevels, levelColor, ONT_PERIODS, parseOntDays, TOGGLE_LEVELS, type OntGraph, type OntIssue, type OntLink, type OntNode } from "@/lib/ontologi";
import { useApi } from "@/lib/useApi";
import controlClasses from "../media/controls.module.css";
import { Segmented } from "../media/controls";
import { Button } from "../ui/Button";
import classes from "../sna/sna.module.css";
import { OntologiPanel } from "./OntologiPanel";

type KeyRow = { id: string; name: string; scope: KeyScope; revokedAt: string | null };
type Node = OntNode & SimulationNodeDatum;
type Edge = Omit<OntLink, "source" | "target"> & SimulationLinkDatum<Node> & { source: Node; target: Node };
const PERIOD_OPTIONS = ONT_PERIODS.map((p) => ({ value: String(p.days), label: p.label }));
const ACTOR_COLOR = "#a78bfa", TARGET_COLOR = "#67e8f9";
// Lucide "flame" (issue), "users" (actor) and "target" (target) glyphs, 24×24.
const ICON = {
  issue: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  actor: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};
const radius = (n: OntNode) => (n.kind === "issue" ? 16 + Math.min(16, n.score / 6) : 6 + Math.min(10, n.count * 2.5));
const ring = (n: OntNode) => (n.kind === "issue" ? levelColor(n.level ?? "") : n.kind === "actor" ? ACTOR_COLOR : TARGET_COLOR);
const short = (s: string, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Graph({ graph, issues, onPick, picked, locked }: { graph: OntGraph; issues: Map<string, OntIssue>; onPick: (id: string | null) => void; picked: string | null; locked: boolean }) {
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
    const root = select(el);
    root.selectAll("*").remove();
    const view = root.append("g");
    const link = view.append("g").selectAll<SVGLineElement, Edge>("line").data(edges).join("line")
      .attr("stroke", (d) => (d.role === "actor" ? ACTOR_COLOR : TARGET_COLOR)).attr("stroke-width", 2).attr("stroke-opacity", 0.9).attr("stroke-linecap", "round").attr("class", classes.flow);
    const node = view.append("g").selectAll<SVGGElement, Node>("g").data(nodes).join("g").attr("data-id", (d) => d.id).style("cursor", "pointer");
    node.append("circle").attr("r", radius).attr("fill", (d) => (d.kind === "issue" ? "#ffffff" : "#1e1b4b")).attr("stroke", ring).attr("stroke-width", (d) => (d.kind === "issue" ? 4 : 2));
    node.append("g").attr("fill", "none").attr("stroke", (d) => (d.kind === "issue" ? "#2e1065" : ring(d))).attr("stroke-width", 2).attr("stroke-linecap", "round").attr("stroke-linejoin", "round")
      .attr("transform", (d) => `scale(${(radius(d) * (d.kind === "issue" ? 1.2 : 1.4)) / 24}) translate(-12,-12)`).style("pointer-events", "none").html((d) => ICON[d.kind]);
    node.append("text").text((d) => short(d.label, d.kind === "issue" ? 38 : 24)).attr("text-anchor", "middle").attr("dy", (d) => radius(d) + 12).attr("font-size", (d) => (d.kind === "issue" ? 12 : 9.5))
      .attr("font-weight", (d) => (d.kind === "issue" ? 700 : 400)).attr("fill", (d) => (d.kind === "issue" ? "#ede9fe" : "#bae6fd")).style("pointer-events", "none");
    // A pill behind each name keeps it readable over the lines.
    node.selectAll<SVGTextElement, Node>("text").each((d, i, els) => {
      const t = els[i], b = t.getBBox();
      select(t.parentNode as SVGGElement).insert("rect", () => t).attr("x", b.x - 4).attr("y", b.y - 1).attr("width", b.width + 8).attr("height", b.height + 2).attr("rx", 5)
        .attr("fill", d.kind === "issue" ? "rgba(46,16,101,.85)" : "rgba(15,13,36,.78)").style("pointer-events", "none");
    });

    const tipEl = tip.current!;
    const place = (e: MouseEvent) => { const r = wrap.getBoundingClientRect(); tipEl.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`; };
    const line = (s: string) => Object.assign(document.createElement("span"), { textContent: s });
    node.on("mousemove", (e: MouseEvent, d) => {
      tipEl.replaceChildren();
      const b = document.createElement("b"); b.textContent = short(d.label, 80);
      if (d.kind === "issue") { const i = issues.get(d.id.slice(2)); tipEl.append(b, line(`${d.level} · skor ${d.score} · ${formatNumber(d.count)} post`), line(i?.location ? `Lokasi: ${i.location}` : "Isu")); }
      else tipEl.append(b, line(`${d.kind === "actor" ? "Aktor" : "Target"} · ${d.count} isu`));
      tipEl.append(line("Klik untuk detail"));
      tipEl.dataset.on = "1"; place(e);
    }).on("mouseleave", () => delete tipEl.dataset.on).on("click", (e: MouseEvent, d) => { e.stopPropagation(); pickRef.current(d.id); });
    root.on("click", () => pickRef.current(null));

    const paint = () => {
      link.attr("x1", (d) => d.source.x!).attr("y1", (d) => d.source.y!).attr("x2", (d) => d.target.x!).attr("y2", (d) => d.target.y!);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    };
    const sim = forceSimulation<Node>(nodes)
      .force("link", forceLink<Node, Edge>(edges).id((d) => d.id).distance(160).strength(0.5))
      .force("charge", forceManyBody<Node>().strength((d) => (d.kind === "issue" ? -1500 : -260)))
      .force("collide", forceCollide<Node>().radius((d) => (d.kind === "issue" ? 90 : radius(d) + 34)).strength(1))
      .on("tick", paint);
    simRef.current = sim;
    sim.stop();
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 4]).on("zoom", (e) => view.attr("transform", e.transform.toString()))
      .filter((e) => !lockedRef.current && (!e.target.closest?.("[data-id]") || e.type === "wheel"));
    root.call(z);
    const fitView = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const xs = nodes.map((n) => n.x ?? 0), ys = nodes.map((n) => n.y ?? 0);
      const x0 = Math.min(...xs) - 80, x1 = Math.max(...xs) + 80, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
      const k = Math.min(1.4, Math.max(0.3, Math.min(width / (x1 - x0), height / (y1 - y0))));
      root.call(z.transform, zoomIdentity.translate(width / 2 - (k * (x0 + x1)) / 2, height / 2 - (k * (y0 + y1)) / 2).scale(k));
    };
    el.style.transition = "none";
    el.style.opacity = "0";
    let timer = 0;
    const reveal = () => requestAnimationFrame(() => { el.style.transition = "opacity 450ms ease"; el.style.opacity = "1"; });
    const fit = () => {
      const { width, height } = wrap.getBoundingClientRect();
      // Issues sit on a ring so their clusters stay apart; actors and targets are pulled loosely to the middle and by the issues they join.
      const issuesOnly = nodes.filter((n) => n.kind === "issue"), r = Math.min(width, height) * 0.36, cy = height / 2 + 20;
      const at = (d: Node) => { const i = issuesOnly.indexOf(d); const a = (i / issuesOnly.length) * 2 * Math.PI - Math.PI / 2; return i < 0 ? null : [width / 2 + r * Math.cos(a), cy + r * Math.sin(a)]; };
      sim.force("x", forceX<Node>((d) => at(d)?.[0] ?? width / 2).strength((d) => (d.kind === "issue" ? 0.25 : 0.02)))
        .force("y", forceY<Node>((d) => at(d)?.[1] ?? cy).strength((d) => (d.kind === "issue" ? 0.25 : 0.02))).alpha(0.5);
      if (lockedRef.current) { for (let i = 0; i < 500; i++) sim.tick(); paint(); fitView(); reveal(); }
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
  }, [graph, issues]);

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

  return <div ref={box} className={classes.canvas}><svg ref={svg} role="img" aria-label="Graf keterkaitan isu dan aktor" /><div ref={tip} className={classes.tip} /></div>;
}

export function OntologiBoard({ keyLocked }: { keyLocked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keyId = params.get("key");
  const days = parseOntDays(params.get("days")) ?? DEFAULT_ONT_DAYS;
  const [picked, setPicked] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [locked, setLocked] = useState(true);
  const [off, setOff] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); // brief loading cover while the graph is rebuilt after a level toggle
  const [full, setFull] = useState(false);
  const stage = useRef<HTMLElement>(null);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setBusy(false), 700);
    return () => window.clearTimeout(t);
  }, [busy]);
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void stage.current?.requestFullscreen(); };

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }, [params, pathname, router]);

  const keys = useApi<KeyRow[]>("/api/admin/keys");
  const projects = (keys.data ?? []).filter((k) => !k.revokedAt && allowsType(k.scope, "social"));
  const res = useApi<{ days: number; issues: OntIssue[] }>(`/api/admin/ontologi?days=${days}${keyId ? `&key=${encodeURIComponent(keyId)}` : ""}`);
  const issues = useMemo(() => res.data?.issues ?? [], [res.data]);
  useEffect(() => { setPicked(null); }, [res.data]);
  useEffect(() => setOff([]), [days, keyId]);
  const shown = useMemo(() => filterLevels(issues, off), [issues, off]);
  const graph = useMemo(() => buildOntologi(shown), [shown]);
  const byId = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);
  const node = picked ? graph.nodes.find((n) => n.id === picked) ?? null : null;
  const periodLabel = ONT_PERIODS.find((p) => p.days === days)!.label;
  const actors = graph.nodes.filter((n) => n.kind === "actor").length, targets = graph.nodes.filter((n) => n.kind === "target").length;
  const stats = [
    { icon: IconFlame, value: shown.length, label: "isu" },
    { icon: IconUsers, value: actors, label: "aktor" },
    { icon: IconTarget, value: targets, label: "target" },
  ];
  const ready = !!res.data;

  return (
    <div className={classes.page}>
      <header className={classes.hero}>
        <div className={classes.heroGrid} aria-hidden />
        <IconHierarchy2 className={classes.heroIcon} size={150} stroke={1} aria-hidden />
        <div className={classes.heroText}>
          <span className={classes.badge}><IconHierarchy2 size={13} />Ontologi</span>
          <h1>Isu dan aktor <em>{periodLabel}</em> terakhir</h1>
        </div>
        <div className={classes.stats}>
          {stats.map((x) => <div key={x.label}><x.icon size={16} aria-hidden /><b>{ready ? formatNumber(x.value) : "—"}</b><span>{x.label}</span></div>)}
        </div>
      </header>

      <div className={classes.toolbar}>
        <Segmented label="Rentang waktu" options={PERIOD_OPTIONS} value={String(days)} onChange={(v) => go({ days: v })} />
        {(!keyLocked || projects.length > 1) && projects.length > 0 && (
          <Select aria-label="Proyek" w={220} allowDeselect={false} classNames={{ input: controlClasses.selectInput, section: controlClasses.selectSection, dropdown: controlClasses.selectDropdown, option: controlClasses.selectOption }}
            comboboxProps={{ withinPortal: true, zIndex: 400 }} value={keyId ?? ""} onChange={(v) => go({ key: v || null })}
            data={[...(keyLocked ? [] : [{ value: "", label: "Nasional" }]), ...projects.map((k) => ({ value: k.id, label: k.name }))]} />
        )}
      </div>

      {res.error && <div className={classes.alert} role="alert"><IconAlertTriangle size={17} />{res.error}<Button size="sm" variant="secondary" onClick={() => void res.reload()}>Coba lagi</Button></div>}

      <section ref={stage} className={classes.stage} data-panel={picked || undefined}>
        {issues.length > 0 && (
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
        {ready && graph.nodes.length === 0 && <p className={classes.empty}>{issues.length ? "Semua level disembunyikan." : "Belum ada isu yang melibatkan aktor atau target proyek ini pada rentang ini."}</p>}
        {graph.nodes.length > 0 && <Graph graph={graph} issues={byId} picked={picked} onPick={setPicked} locked={locked} />}
        {(res.loading || busy || (!ready && !res.error)) && (
          <div className={classes.loading} data-covering={ready ? undefined : ""} role="status" aria-live="polite">
            <div className={classes.ghost} aria-hidden><i /><i /><i /><i /><i /><i /><i /></div>
            <span>Memuat keterkaitan…</span>
          </div>
        )}
        {issues.length > 0 && ( // stays when every level is switched off, so they can be switched back on
          <aside className={classes.legendBox} data-open={legendOpen || undefined}>
            <button type="button" className={classes.legendToggle} aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}>
              <IconInfoCircle size={15} />Legenda{legendOpen ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
            </button>
            {legendOpen && (
              <ul>
                <li className={classes.legendHead}>Level isu (klik toggle untuk menyembunyikan)</li>
                {TOGGLE_LEVELS.map((l) => {
                  const on = !off.includes(l);
                  return (
                    <li key={l} data-off={!on || undefined}>
                      <i className={classes.swatch} style={{ background: levelColor(l) }} />{l}
                      <button type="button" role="switch" aria-checked={on} aria-label={`Tampilkan level ${l}`} className={classes.switch} onClick={() => { setOff(on ? [...off, l] : off.filter((x) => x !== l)); setBusy(true); }} />
                    </li>
                  );
                })}
                <li className={classes.legendHead}>Simpul</li>
                <li className={classes.legendNote}><IconFlame size={16} /><span><b>Isu</b>: lingkaran putih, border = level, makin besar = skor makin tinggi.</span></li>
                <li className={classes.legendNote}><IconUsers size={16} /><span><b>Aktor</b>: pelaku di dalam isu (ungu).</span></li>
                <li className={classes.legendNote}><IconTarget size={16} /><span><b>Target</b>: sasaran isu (biru muda).</span></li>
                <li className={classes.legendHead}>Garis</li>
                <li className={classes.legendNote}><span>Bergerak dari aktor ke isu, lalu dari isu ke target. Aktor atau target yang sama di beberapa isu menghubungkan isu-isu itu.</span></li>
              </ul>
            )}
          </aside>
        )}
        {picked && node && <OntologiPanel key={picked} node={node} graph={graph} issues={byId} onPick={setPicked} onClose={() => setPicked(null)} />}
      </section>
    </div>
  );
}
