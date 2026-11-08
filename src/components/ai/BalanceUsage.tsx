"use client";
// AI usage per hour or day with a switchable time range: provider credit spent (from balance snapshots)
// or tokens billed (recorded per request, works for every provider).
import { useEffect, useRef, useState } from "react";
import { IconChartBar } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { useApi } from "@/lib/useApi";
import classes from "./usage.module.css";

type Usage = {
  currency: string | null; current: number | null; checkedAt?: string; since: string | null; bucket?: "hour" | "day";
  buckets: { start: string; spent: number; topUp: number }[];
  tokens?: { start: string; input: number; output: number; calls: number }[];
  models?: string[];
};
type Mode = "balance" | "tokens";
const compact = (n: number) => new Intl.NumberFormat("id-ID", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);

const RANGES = [
  { days: "1", label: "24 jam" },
  { days: "7", label: "7 hari" },
  { days: "30", label: "30 hari" },
  { days: "90", label: "90 hari" },
] as const;

const money = (amount: number, currency: string, digits = 2) => {
  try { return new Intl.NumberFormat("id-ID", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) }).format(amount); }
  catch { return `${amount.toFixed(digits)} ${currency}`; }
};

/** A "nice" axis maximum (1, 2, 2.5, 5 × 10ⁿ) so gridlines land on round values. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  return ([1, 2, 2.5, 5, 10].find((s) => s * exp >= value) ?? 10) * exp;
}

const H = 170, PAD = { top: 12, right: 8, bottom: 26, left: 52 };

export function BalanceUsage({ keyId }: { keyId: string }) {
  const [days, setDays] = useState<string>("7");
  const [mode, setMode] = useState<Mode>("balance");
  const usage = useApi<Usage>(`/api/admin/keys/${keyId}/classifier/usage?days=${days}`);
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real width so text and bars keep their pixel size at any panel width.
  const plotRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [usage.data]);
  const data = usage.data;
  const currency = data?.currency ?? "USD";
  const tokenMode = mode === "tokens";
  // One series for the chart: credit spent, or input + output tokens.
  const buckets = tokenMode
    ? (data?.tokens ?? []).map((t) => ({ start: t.start, spent: t.input + t.output, topUp: 0, input: t.input, output: t.output, calls: t.calls }))
    : (data?.buckets ?? []).map((b) => ({ ...b, input: 0, output: 0, calls: 0 }));
  const fmt = (v: number, digits = 2) => (tokenMode ? compact(v) : money(v, currency, digits));
  const spent = buckets.reduce((s, b) => s + b.spent, 0);
  const topUp = buckets.reduce((s, b) => s + b.topUp, 0);
  const inputTotal = buckets.reduce((s, b) => s + b.input, 0);
  const outputTotal = buckets.reduce((s, b) => s + b.output, 0);
  const hourly = data?.bucket === "hour" || days === "1";
  const average = buckets.length ? spent / buckets.length : 0;

  const max = niceMax(Math.max(...buckets.map((b) => b.spent), 0));
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  const step = plotW / Math.max(1, buckets.length);
  const barW = Math.max(2, Math.min(28, step - 2));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(buckets.length / Math.max(3, Math.floor(W / 90)));
  const fmtBucket = (iso: string, long = false) => dayjs(iso).locale("id").format(hourly ? (long ? "D MMM, HH:00" : "HH:00") : (long ? "dddd, D MMM YYYY" : "D MMM"));
  const hovered = hover !== null && spent + topUp > 0 ? buckets[hover] : null;

  return (
    <section className={classes.card}>
      <header className={classes.head}>
        <span className={classes.icon}><IconChartBar size={16} /></span>
        <div>
          <b>{tokenMode ? "Penggunaan token" : "Penggunaan saldo"}</b>
          <small>{tokenMode
            ? `Token yang dipakai proyek ini per ${hourly ? "jam" : "hari"}${data?.models?.length ? ` · ${data.models.join(", ")}` : ""}`
            : `Kredit penyedia AI yang terpakai per ${hourly ? "jam" : "hari"}`}</small>
        </div>
        <div className={classes.ranges} role="tablist" aria-label="Satuan">
          {(["balance", "tokens"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} data-active={mode === m || undefined} onClick={() => { setMode(m); setHover(null); }}>{m === "balance" ? "Saldo" : "Token"}</button>
          ))}
        </div>
        <div className={classes.ranges} role="tablist" aria-label="Rentang waktu">
          {RANGES.map((r) => (
            <button key={r.days} type="button" role="tab" aria-selected={days === r.days} data-active={days === r.days || undefined} onClick={() => { setDays(r.days); setHover(null); }}>{r.label}</button>
          ))}
        </div>
      </header>

      <div className={classes.stats}>
        <div><small>{tokenMode ? "Total token" : "Terpakai"}</small><b>{data ? fmt(spent) : "—"}</b><span>{RANGES.find((r) => r.days === days)!.label} terakhir</span></div>
        {tokenMode ? <>
          <div><small>Input</small><b>{data ? compact(inputTotal) : "—"}</b><span>token prompt</span></div>
          <div><small>Output</small><b>{data ? compact(outputTotal) : "—"}</b><span>token jawaban</span></div>
        </> : <>
          <div><small>Rata-rata</small><b>{data ? money(average, currency) : "—"}</b><span>per {hourly ? "jam" : "hari"}</span></div>
          <div><small>Top-up</small><b>{data ? money(topUp, currency) : "—"}</b><span>dalam rentang</span></div>
        </>}
      </div>

      {usage.error ? <p className={classes.note}>{usage.error}</p> : !data ? <div className={classes.skeleton} /> : (
        <div ref={plotRef} className={classes.plot} onMouseLeave={() => setHover(null)}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Grafik ${tokenMode ? "token" : "saldo terpakai"} per ${hourly ? "jam" : "hari"}, total ${fmt(spent)}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? classes.baseline : classes.grid} />
                <text x={PAD.left - 8} y={y(t)} className={classes.tick} textAnchor="end" dominantBaseline="middle">{fmt(t, t === 0 ? 0 : 2)}</text>
              </g>
            ))}
            {buckets.map((b, i) => {
              const x = PAD.left + i * step + (step - barW) / 2;
              const h = Math.max(0, y(0) - y(b.spent));
              return (
                <g key={b.start}>
                  {hovered && hover === i && <rect x={PAD.left + i * step} y={PAD.top} width={step} height={plotH} className={classes.hoverBand} />}
                  {h > 0 && <path className={classes.bar} data-dim={(hover !== null && hover !== i) || undefined}
                    d={`M${x},${y(0)} V${y(b.spent) + Math.min(4, h)} a${Math.min(4, barW / 2, h)},${Math.min(4, barW / 2, h)} 0 0 1 ${Math.min(4, barW / 2, h)},-${Math.min(4, barW / 2, h)} H${x + barW - Math.min(4, barW / 2, h)} a${Math.min(4, barW / 2, h)},${Math.min(4, barW / 2, h)} 0 0 1 ${Math.min(4, barW / 2, h)},${Math.min(4, barW / 2, h)} V${y(0)} Z`} />}
                  {b.topUp > 0 && <circle cx={x + barW / 2} cy={y(b.spent) - 9} r={4} className={classes.topUp} />}
                  {i % labelEvery === 0 && <text x={x + barW / 2} y={H - 8} className={classes.tick} textAnchor="middle">{fmtBucket(b.start)}</text>}
                  <rect x={PAD.left + i * step} y={PAD.top} width={step} height={plotH + PAD.bottom} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
                    aria-label={`${fmtBucket(b.start, true)}: ${fmt(b.spent)}`} />
                </g>
              );
            })}
          </svg>
          {hovered && (
            <div className={classes.tooltip} style={{ left: Math.min(W - 70, Math.max(70, PAD.left + hover! * step + step / 2)) }}>
              <small>{fmtBucket(hovered.start, true)}</small>
              <b>{tokenMode ? `${compact(hovered.spent)} token` : money(hovered.spent, currency, 4)}</b>
              <span>{tokenMode ? `${compact(hovered.input)} input · ${compact(hovered.output)} output · ${hovered.calls} permintaan` : "terpakai"}</span>
              {hovered.topUp > 0 && <em>+{money(hovered.topUp, currency)} top-up</em>}
            </div>
          )}
          {spent === 0 && (
            <p className={classes.empty}>
              {tokenMode ? "Belum ada token tercatat dalam rentang ini. Token dicatat untuk setiap permintaan ke penyedia AI."
                : data.since
                ? `Belum ada saldo terpakai dalam rentang ini. Riwayat tercatat sejak ${dayjs(data.since).locale("id").format("D MMM YYYY, HH:mm")}.`
                : "Belum ada riwayat saldo. Saldo dicatat setiap 15 menit selama kategorisasi berjalan, dan setiap kali saldo diperbarui."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
