"use client";
// Full-screen network of one issue, opened from the issue pages: its SNA (who talks about it and whom they mention, or
// which outlets and journalists report it) and its ontology (actors and targets, or topics and regions), drawn as a
// Gephi map (WebGL, so there is no node limit). The SNA page's tools: Isu / Mention view and the flows (Langsung,
// Mention, Rantai waktu, Gelombang) for social issues, a "Tampilan" menu (colour, size, flow, emotions), tree layout,
// search; a side panel lists the picked node's links.
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Modal, Skeleton } from "@mantine/core";
import { Tooltip } from "@mantine/core";
import { IconBinaryTree2, IconChartDots3, IconHierarchy2, IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import { ontologyAsSna } from "@/lib/issueNetwork";
import { formatNumber } from "@/lib/media/labels";
import type { OntGraph } from "@/lib/ontology";
import { ACCOUNT_LABEL, filterGraph, KIND_COLOR, SNA_FLOWS, TONE_COLOR, TONE_LABEL, type SnaFlow, type SnaGraph, type SnaView, type Tone } from "@/lib/sna";
import { TREE_COMPACT, treeLayout } from "@/lib/snaTree";
import type { NetworkAnalysis } from "@/lib/snaNetwork";
import { useApi } from "@/lib/useApi";
import { Segmented } from "../ui/controls";
import type { GephiColor, GephiSize } from "../sna/GephiGraph";
import { SnaFlowGuide } from "../sna/SnaFlowGuide";
import { MenuRow, ViewMenu } from "../sna/ViewMenu";
import sna from "../sna/sna.module.css";
import c from "./issueNetwork.module.css";

const GephiGraph = dynamic(() => import("../sna/GephiGraph").then((m) => m.GephiGraph), { ssr: false });

export type NetworkKind = "social" | "online";
/** What each node type is called in this network (legend, panel). */
const KIND_NAMES: Record<NetworkKind, Record<NetworkTab, { hub: string; child: string }>> = {
  social: { sna: { hub: "Akun yang memposting", child: "Akun yang disebut" }, ontologi: { hub: "Aktor", child: "Target" } },
  online: { sna: { hub: "Media", child: "Jurnalis" }, ontologi: { hub: "Topik", child: "Wilayah" } },
};
const TABS = [{ value: "sna", label: "SNA" }, { value: "ontologi", label: "Ontologi" }] as const;
const COLORS: { value: GephiColor; label: string }[] = [{ value: "klaster", label: "Klaster" }, { value: "emosi", label: "Emosi" }, { value: "jenis", label: "Jenis" }];
const SIZES: { value: GephiSize; label: string }[] = [{ value: "engagement", label: "Jangkauan" }, { value: "betweenness", label: "Jembatan" }];
const VIEWS = [{ value: "isu", label: "Isu" }, { value: "mention", label: "Mention" }] as const;
const FLOWS = SNA_FLOWS.map((f) => ({ value: f.value, label: f.label }));
const TONES: Tone[] = ["negative", "neutral", "positive"];

export type NetworkTab = "sna" | "ontologi";

export function IssueNetwork({ opened, onClose, kind, url, title, meta, ontology, initialTab = "sna" }: {
  opened: boolean; onClose: () => void; kind: NetworkKind;
  /** The tab it opens on. */
  initialTab?: NetworkTab;
  /** The issue's network API (null while closed): { sna, ontology? }. */
  url: string | null;
  title: string;
  /** Short facts under the title (level, posts, period). */
  meta: React.ReactNode;
  /** Social issues: the ontology is built from the issue list already on the page. */
  ontology?: OntGraph;
}) {
  // Social issues are drawn like the SNA page: Isu view with a flow, or Mention view (the server builds each).
  const [view, setView] = useState<SnaView>("isu");
  const [flow, setFlow] = useState<SnaFlow>("langsung");
  const social = kind === "social";
  const fetchUrl = url && social ? `${url}${url.includes("?") ? "&" : "?"}view=${view}${view === "isu" ? `&flow=${flow}` : ""}` : url;
  const res = useApi<{ sna: SnaGraph; ontology?: OntGraph }>(opened ? fetchUrl : null);
  const [off, setOff] = useState<Tone[]>([]);
  const [tree, setTree] = useState(false);
  const [tab, setTab] = useState<NetworkTab>(initialTab);
  useEffect(() => { if (opened) setTab(initialTab); }, [opened, initialTab]);
  // Ontologies are one community around the issue: colour them by type; SNA by community.
  useEffect(() => setColor(tab === "ontologi" ? "jenis" : "klaster"), [tab]);
  const [color, setColor] = useState<GephiColor>("klaster");
  const [size, setSize] = useState<GephiSize>("engagement");
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => { setPicked(null); setQuery(""); }, [tab, url, view, flow]);
  useEffect(() => { if (!opened) { setView("isu"); setFlow("langsung"); setOff([]); setTree(false); } }, [opened]);

  const ont = ontology ?? res.data?.ontology ?? null;
  // Ontology edges carry the role, not an emotion: colour them by type instead.
  const colorMode: GephiColor = tab === "ontologi" && color === "emosi" ? "jenis" : color;
  // Data of the current request only: while another view or flow loads, the old map is not shown as the new one.
  const snaGraph = res.loading ? null : res.data?.sna ?? null;
  const graph = useMemo<SnaGraph | null>(() => (tab === "sna" ? (snaGraph ? filterGraph(snaGraph, off) : null) : ont ? ontologyAsSna(ont) : null), [tab, snaGraph, ont, off]);
  const canTree = tab === "sna" && view === "isu" && !!graph?.nodes.some((n) => n.kind === "issue") && graph.nodes.length > 1;
  const layout = useMemo(() => (tree && canTree && graph ? treeLayout(graph, TREE_COMPACT) : null), [tree, canTree, graph]);
  const changed = (colorMode !== (tab === "ontologi" ? "jenis" : "klaster") ? 1 : 0) + (size !== "engagement" ? 1 : 0) + (flow !== "langsung" ? 1 : 0) + off.length;

  const [analysis, setAnalysis] = useState<{ of: SnaGraph; a: NetworkAnalysis } | null>(null);
  useEffect(() => {
    if (!graph) return;
    let stale = false;
    void import("@/lib/snaNetwork").then((m) => { if (!stale) setAnalysis({ of: graph, a: m.analyzeNetwork(graph) }); });
    return () => { stale = true; };
  }, [graph]);
  const ready = graph && analysis?.of === graph ? analysis.a : null;

  const names = KIND_NAMES[kind][tab];
  const label = (id: string) => {
    const n = graph?.nodes.find((x) => x.id === id);
    return !n ? id : n.kind === "issue" ? n.title ?? "Isu" : n.name ?? `@${n.id}`;
  };
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !graph) return [];
    return graph.nodes.filter((n) => (n.kind === "issue" ? n.title ?? "" : n.name ?? n.id).toLowerCase().includes(q)).slice(0, 8);
  }, [query, graph]);
  const counts = useMemo(() => {
    const k = { hub: 0, child: 0 };
    for (const n of graph?.nodes ?? []) if (n.kind !== "issue") k[n.kind] += 1;
    return k;
  }, [graph]);

  return (
    <Modal opened={opened} onClose={onClose} fullScreen withCloseButton={false} padding={0} transitionProps={{ transition: "fade", duration: 180 }}
      classNames={{ content: c.content, body: c.body }} aria-label={`Jaringan isu: ${title}`}>
      <header className={c.head}>
        <span className={c.headIcon}>{tab === "sna" ? <IconChartDots3 size={20} /> : <IconHierarchy2 size={20} />}</span>
        <div className={c.headText}>
          <small>Jaringan isu</small>
          <h2 title={title}>{title}</h2>
          <div className={c.meta}>{meta}</div>
        </div>
        <Segmented value={tab} options={[...TABS]} onChange={(v) => setTab(v as NetworkTab)} label="Tampilan jaringan" className={c.tabs} />
        <button type="button" className={c.close} onClick={onClose} aria-label="Tutup"><IconX size={18} /></button>
      </header>

      <section className={`${sna.stage} ${c.stage}`} data-panel={picked ? "" : undefined}>
        <div role="toolbar" aria-label="Pengaturan peta" className={c.toolbar}>
          {social && tab === "sna" && <Segmented label="Tampilan SNA" options={VIEWS} value={view} onChange={(v) => setView(v as SnaView)} />}
          <div className={c.search}>
            <IconSearch size={15} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Cari node…" aria-label="Cari node" />
            {hits.length > 0 && (
              <ul className={c.hits}>
                {hits.map((n) => (
                  <li key={n.id}><button type="button" onClick={() => { setPicked(n.id); setQuery(""); }}>
                    <i style={{ background: KIND_COLOR[n.kind] }} />{n.kind === "issue" ? n.title : n.name ?? `@${n.id}`}
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          {graph && <span className={c.stat}><b>{formatNumber(graph.nodes.length)}</b> node · <b>{formatNumber(graph.links.length)}</b> hubungan</span>}
          <div className={sna.barEnd}>
            <ViewMenu changed={changed}>
              <MenuRow label="Warna node"><Segmented label="Warna" options={tab === "ontologi" ? COLORS.filter((o) => o.value !== "emosi") : COLORS} value={colorMode} onChange={(v) => setColor(v as GephiColor)} /></MenuRow>
              <MenuRow label="Ukuran node"><Segmented label="Ukuran node" options={SIZES} value={size} onChange={(v) => setSize(v as GephiSize)} /></MenuRow>
              {social && tab === "sna" && view === "isu" && <MenuRow label="Alur"><Segmented label="Alur" options={FLOWS} value={flow} onChange={(v) => setFlow(v as SnaFlow)} /></MenuRow>}
              {tab === "sna" && (
                <MenuRow label="Emosi">
                  <div className={sna.tones} role="group" aria-label="Emosi yang ditampilkan">
                    {TONES.map((t) => {
                      const on = !off.includes(t);
                      return (
                        <button key={t} type="button" aria-pressed={on} data-off={!on || undefined} title={on ? `Sembunyikan ${TONE_LABEL[t].toLowerCase()}` : `Tampilkan ${TONE_LABEL[t].toLowerCase()}`}
                          onClick={() => setOff(on ? [...off, t] : off.filter((x) => x !== t))}>
                          <i style={{ background: TONE_COLOR[t] }} />{TONE_LABEL[t]}
                        </button>
                      );
                    })}
                  </div>
                </MenuRow>
              )}
            </ViewMenu>
            {canTree && (
              <Tooltip label={tree ? "Kembali ke susunan bebas" : "Susun pohon: isu di atas, akunnya di bawah"} withinPortal={false} position="bottom" withArrow>
                <button type="button" className={sna.tool} aria-pressed={tree} aria-label="Susun pohon" data-active={tree || undefined} onClick={() => setTree(!tree)}><IconBinaryTree2 size={16} /></button>
              </Tooltip>
            )}
          </div>
        </div>
        {social && tab === "sna" && view === "isu" && graph && graph.nodes.length > 1 && !picked && <SnaFlowGuide flow={flow} onPick={setFlow} />}

        {res.error && !res.data ? (
          <div className={c.state}><b>Jaringan belum bisa dimuat</b><p>{res.error}</p>
            <button type="button" className={c.retry} onClick={res.reload}><IconRefresh size={15} />Coba lagi</button></div>
        ) : !graph || !ready ? (
          <div className={c.state} aria-busy><span className={c.pulse} /><b>Menyusun jaringan…</b><p>Semua node isu ini dimuat, tanpa batas jumlah.</p>
            <div className={c.skeleton}>{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} h={10} radius="xl" w={`${70 - i * 15}%`} />)}</div></div>
        ) : social && tab === "sna" && view === "mention" && graph.links.length === 0 ? (
          <div className={c.state}><b>Tidak ada mention</b><p>Post isu ini tidak menyebut atau membalas akun lain. Gunakan tampilan Isu untuk melihat siapa saja yang membahasnya.</p>
            <button type="button" className={c.retry} onClick={() => setView("isu")}>Ke tampilan Isu</button></div>
        ) : graph.nodes.length <= 1 ? (
          <div className={c.state}><b>Belum ada jaringan</b><p>{tab === "sna" ? "Belum ada akun atau media yang tercatat untuk isu ini." : "Isu ini belum menyebut aktor, target, topik, atau wilayah."}</p></div>
        ) : (
          <GephiGraph graph={graph} analysis={ready} picked={picked} onPick={setPicked} color={colorMode} size={size} layout={layout}
            bridgeTitle={tab === "sna" ? (kind === "social" ? "Akun jembatan" : "Simpul jembatan") : "Entitas jembatan"} />
        )}

        <aside aria-label="Legenda" className={c.legend}>
          {colorMode === "emosi" ? (["negative", "neutral", "positive", "unknown"] as Tone[]).map((t) => <span key={t}><i style={{ background: TONE_COLOR[t] }} />{TONE_LABEL[t]}</span>)
            : <>
              <span><i style={{ background: KIND_COLOR.issue }} />Isu</span>
              <span><i style={{ background: KIND_COLOR.hub }} />{names.hub} <small>{formatNumber(counts.hub)}</small></span>
              <span><i style={{ background: KIND_COLOR.child }} />{names.child} <small>{formatNumber(counts.child)}</small></span>
            </>}
          <span className={c.hint}>Gulir untuk zoom · seret node · klik untuk detail</span>
        </aside>

        {picked && graph && <NodePanel graph={graph} id={picked} names={names} label={label} onPick={setPicked} />}
      </section>
    </Modal>
  );
}

/** The picked node: what it is, its size, and its links (strongest first, each one opens that node). */
function NodePanel({ graph, id, names, label, onPick }: {
  graph: SnaGraph; id: string; names: { hub: string; child: string }; label: (id: string) => string; onPick: (id: string | null) => void;
}) {
  const node = graph.nodes.find((n) => n.id === id);
  const links = useMemo(() => graph.links.filter((l) => l.source === id || l.target === id)
    .map((l) => ({ other: l.source === id ? l.target : l.source, n: l.n, tone: l.tone }))
    .sort((a, b) => b.n - a.n), [graph, id]);
  if (!node) return null;
  const type = node.kind === "issue" ? "Isu" : node.kind === "hub" ? names.hub : names.child;
  return (
    <aside className={`${sna.panel} ${c.panel}`} aria-label="Detail node">
      <header>
        <span className={c.panelDot} style={{ background: KIND_COLOR[node.kind] }} />
        <div><b title={label(id)}>{label(id)}</b><small>{type}{node.account ? ` · ${ACCOUNT_LABEL[node.account]}` : ""}</small></div>
        <button type="button" className={c.close} onClick={() => onPick(null)} aria-label="Tutup detail"><IconX size={16} /></button>
      </header>
      <div className={c.panelStats}>
        <div><b>{formatNumber(links.length)}</b><small>hubungan</small></div>
        {node.posts > 0 && <div><b>{formatNumber(node.posts)}</b><small>{node.kind === "issue" ? "item" : "post / berita"}</small></div>}
        {(node.engagement ?? 0) > 0 && node.kind !== "issue" && <div><b>{formatNumber(Math.round(node.engagement ?? 0))}</b><small>jangkauan</small></div>}
      </div>
      <b className={c.panelHeading}>Terhubung dengan</b>
      <ol className={c.panelList}>
        {links.slice(0, 200).map((l) => (
          <li key={l.other}><button type="button" onClick={() => onPick(l.other)}>
            <i style={{ background: TONE_COLOR[l.tone] }} title={TONE_LABEL[l.tone]} /><span>{label(l.other)}</span><small>{formatNumber(l.n)}</small>
          </button></li>
        ))}
      </ol>
      {links.length > 200 && <small className={c.more}>+{formatNumber(links.length - 200)} hubungan lain</small>}
    </aside>
  );
}
