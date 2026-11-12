"use client";
// Command Center charts, all drawn with Chart.js (react-chartjs-2).
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip, type Plugin } from "chart.js";
import { Bar as BarChart, Doughnut, Line } from "react-chartjs-2";
import { formatNumber } from "@/lib/media/labels";
import classes from "./commandCenter.module.css";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);
const INK = "#e4e0fb", MUTED = "#a9a4d6", TRACK = "rgba(255,255,255,.14)", GRID = "rgba(255,255,255,.1)";

/** Canvas cannot read CSS variables, so `var(--x)` colours are resolved to their value first. */
const cssColor = (c: string) => {
  const name = /^var\((--[^)]+)\)$/.exec(c)?.[1];
  return name && typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || c : c;
};

export type Slice = { label: string; value: number; color: string };

/** Donut with the total in the middle and a legend underneath. */
export function Donut({ title, slices }: { title: string; slices: Slice[] }) {
  const shown = slices.filter((s) => s.value > 0);
  const total = shown.reduce((t, s) => t + s.value, 0);
  return (
    <figure className={classes.donut}>
      <div className={classes.ring}>
        <Doughnut aria-label={title}
          data={{ labels: shown.map((s) => s.label), datasets: [{ data: total ? shown.map((s) => s.value) : [1], backgroundColor: total ? shown.map((s) => cssColor(s.color)) : [TRACK], borderWidth: 2, borderColor: "rgba(16,14,44,.9)", hoverOffset: 4 }] }}
          options={{ responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { display: false }, tooltip: { enabled: total > 0, callbacks: { label: (c) => ` ${c.label}: ${formatNumber(c.parsed)} (${Math.round((c.parsed / total) * 100)}%)` } } } }} />
        <span className={classes.ringText}>{total ? formatNumber(total) : "—"}</span>
      </div>
      <figcaption>{title}</figcaption>
      <ul>{shown.slice(0, 3).map((s) => <li key={s.label}><i style={{ background: s.color }} />{s.label}<b>{Math.round((s.value / total) * 100)}%</b></li>)}</ul>
    </figure>
  );
}

/** Full-circle progress gauge (value 0..1). */
export function Gauge({ label, value, text, sub, color }: { label: string; value: number; text: string; sub: string; color: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <figure className={classes.gauge}>
      <div className={classes.ring}>
        <Doughnut aria-label={`${label}: ${text}`}
          data={{ datasets: [{ data: [v, 1 - v], backgroundColor: [color, TRACK], borderWidth: 0, borderRadius: 8 }] }}
          options={{ responsive: true, maintainAspectRatio: false, cutout: "78%", plugins: { legend: { display: false }, tooltip: { enabled: false } } }} />
        <span className={classes.ringText}>{text}</span>
      </div>
      <figcaption>{label}<small>{sub}</small></figcaption>
    </figure>
  );
}

export type Series = { label: string; color: string; values: number[] };
/** Daily volume as a Chart.js area chart on one shared scale. Leading days with no data at all are left out. */
export function LineChart({ labels, series }: { labels: string[]; series: Series[] }) {
  const first = Math.max(0, labels.findIndex((_, i) => series.some((s) => s.values[i] > 0)));
  const from = Math.min(first, labels.length - 2);
  return (
    <div className={classes.line}>
      <Line
        aria-label="Volume harian"
        data={{
          labels: labels.slice(from),
          datasets: series.map((s) => ({ label: s.label, data: s.values.slice(from), borderColor: s.color, backgroundColor: `${s.color}22`, fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: s.color })),
        }}
        options={{
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, color: INK, generateLabels: (chart) => ChartJS.defaults.plugins.legend.labels.generateLabels(chart).map((l) => ({ ...l, fillStyle: String(l.strokeStyle) })) } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatNumber(c.parsed.y ?? 0)}` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: MUTED, maxTicksLimit: 8, maxRotation: 0 } },
            y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: MUTED, maxTicksLimit: 5, callback: (v) => formatNumber(Number(v)) } },
          },
        }}
      />
    </div>
  );
}

export type TrendDay = { label: string; pos: number; neu: number; neg: number };
/** Sentiment per day as stacked columns: negative at the bottom, positive on top. */
export function TrendBars({ days }: { days: TrendDay[] }) {
  const set = (label: string, color: string, pick: (d: TrendDay) => number) => ({ label, data: days.map(pick), backgroundColor: color, stack: "s", borderWidth: 0 });
  return (
    <div className={classes.line}>
      <BarChart
        aria-label="Tren sentimen harian"
        data={{ labels: days.map((d) => d.label), datasets: [set("Negatif", "#fb7185", (d) => d.neg), set("Netral", "#94a3b8", (d) => d.neu), set("Positif", "#34d399", (d) => d.pos)] }}
        options={{
          responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, color: INK } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${formatNumber(c.parsed.y ?? 0)}` } } },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: MUTED, maxTicksLimit: 8, maxRotation: 0 } },
            y: { stacked: true, beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: MUTED, maxTicksLimit: 4, callback: (v) => formatNumber(Number(v)) } },
          },
        }}
      />
    </div>
  );
}

export type Bar = { label: string; value: number; hint?: string; onClick?: () => void };
const clip = (t: string, n = 26) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const LABEL_W = 140;
/** Left-aligned label before each bar and its value just past the bar's end (Chart.js ticks can only right-align). */
const barTexts = (labels: string[], hints: string[]): Plugin<"bar"> => ({
  id: "barTexts",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save(); ctx.textBaseline = "middle";
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      ctx.fillStyle = INK; ctx.font = "12px sans-serif"; ctx.textAlign = "left"; ctx.fillText(clip(labels[i], 22), 0, bar.y);
      ctx.fillStyle = "#fff"; ctx.font = "700 12px sans-serif"; ctx.fillText(hints[i], bar.x + 6, bar.y);
    });
    ctx.restore();
  },
});

/** Horizontal bars, longest first; a bar with onClick is a link (pointer cursor, click opens it). */
export function Bars({ items, color }: { items: Bar[]; color: string }) {
  if (!items.length) return <p className={classes.empty}>Belum ada data</p>;
  const hints = items.map((b) => b.hint ?? formatNumber(b.value));
  return (
    <div className={classes.bars}>
      <BarChart
        data={{ labels: items.map((b) => b.label), datasets: [{ data: items.map((b) => b.value), backgroundColor: color, borderRadius: 6, barThickness: 10 }] }}
        plugins={[barTexts(items.map((b) => b.label), hints)]}
        options={{
          indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { left: LABEL_W, right: 44 } },
          onClick: (_, els) => { if (els[0]) items[els[0].index].onClick?.(); },
          onHover: (e, els) => { const t = e.native?.target as HTMLElement | null; if (t) t.style.cursor = els[0] && items[els[0].index].onClick ? "pointer" : "default"; },
          plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => items[c[0].dataIndex].label, label: (c) => ` ${hints[c.dataIndex]}` } } },
          scales: {
            x: { display: false, beginAtZero: true },
            y: { display: false },
          },
        }}
      />
    </div>
  );
}
