"use client";
// Biaya AI yang dibayar key milik Signalbase: AI platform (Ringkasan AI, laporan) dan kategorisasi proyek yang memakai
// key itu. Key DeepSeek milik klien (mis. KIPERMAS) tidak dihitung. Angka dalam USD dengan padanan Rupiah (kurs live).
import { Skeleton } from "@mantine/core";
import { IconChartBar, IconCoin, IconInfoCircle, IconRadar } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import c from "./aiSettings.module.css";

type Costs = {
  today: string; kurs: number | null; keyHint: string | null; model: string | null; saldo: number | null;
  month: { cost: number; calls: number; tokens: number };
  avgDaily: number | null; projection: number | null; basisDays: number; daysInMonth: number;
  modules: { module: string; label: string; calls: number; tokens: number; cost: number }[];
  daily: { day: string; module: string; cost: number }[];
  labels: { project: string; local: number; ai: number }[];
  excluded: { tokens: number; calls: number };
};

const COLORS = ["#7c3aed", "#0891b2", "#f59e0b", "#10b981", "#ef4444", "#6366f1", "#ec4899"];
const usd = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: n > 0 && n < 0.01 ? 4 : 2, maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2 })}`);
const rp = (n: number | null, kurs: number | null) => (n == null || !kurs ? "" : `≈ Rp${Math.round(n * kurs).toLocaleString("id-ID")}`);

export function AiCosts() {
  const { data: d } = useApi<Costs>("/api/admin/ai-costs");
  const modules = d?.modules ?? [];
  const color = (m: string) => COLORS[Math.max(0, modules.findIndex((x) => x.module === m)) % COLORS.length];
  const total = modules.reduce((s, m) => s + m.cost, 0);

  return (
    <div className={c.page}>
      <header className={c.hero}>
        <div className={c.heroGrid} aria-hidden />
        <div className={c.heroText}>
          <span className={c.badge}><IconCoin size={13} />Biaya AI</span>
          <h1>Biaya <em>AI</em> Signalbase</h1>
          <p>
            Yang dibayar key DeepSeek milik Signalbase{d?.keyHint ? <> (<code>…{d.keyHint}</code>)</> : ""}: Ringkasan AI, laporan, dan kategorisasi proyek
            yang memakai key itu. Key milik klien (mis. KIPERMAS) tidak dihitung.{d?.kurs ? ` Kurs Rp${d.kurs.toLocaleString("id-ID")}/USD (live, open.er-api.com).` : ""}
          </p>
        </div>
        <div className={c.stats}>
          <div><b>{d ? usd(d.month.cost) : "—"}</b><span>Bulan ini {d ? rp(d.month.cost, d.kurs) : ""}</span></div>
          <div><b>{d ? usd(d.projection) : "—"}</b><span>Perkiraan sebulan {d ? rp(d.projection, d.kurs) : ""}</span></div>
          <div><b>{d ? usd(d.saldo) : "—"}</b><span>Saldo key {d ? rp(d.saldo, d.kurs) : ""}</span></div>
        </div>
      </header>

      <section className={c.card}>
        <header className={c.cardHead}>
          <div><h3>Biaya per hari per modul</h3><p>30 hari terakhir · perkiraan dari token × harga resmi DeepSeek</p></div>
          <IconChartBar size={18} className={c.headIcon} />
        </header>
        {!d ? <Skeleton h={220} radius="lg" /> : <StackedChart d={d} color={color} />}
        {d && modules.length > 0 && (
          <div className={c.legend}>{modules.map((m) => <span key={m.module}><i style={{ background: color(m.module) }} />{m.label}</span>)}</div>
        )}
        {d && (
          <dl className={c.totals}>
            <div><dt>Rata-rata per hari</dt><dd>{usd(d.avgDaily)}</dd></div>
            <div><dt>Panggilan bulan ini</dt><dd>{formatNumber(d.month.calls)}</dd></div>
            <div><dt>Token bulan ini</dt><dd>{formatNumber(d.month.tokens)}</dd></div>
          </dl>
        )}
      </section>

      <div className={c.grid}>
        <section className={c.card}>
          <header className={c.cardHead}>
            <div><h3>Per modul · {d ? dayjs(d.today).locale("id").format("MMMM YYYY") : "bulan ini"}</h3><p>Hanya yang dibayar key Signalbase</p></div>
            <IconCoin size={18} className={c.headIcon} />
          </header>
          {!d ? <Skeleton h={160} radius="lg" /> : !modules.length ? <p className={c.empty}>Belum ada biaya bulan ini.</p> : (
            <div className={c.tableWrap}>
              <table className={c.table}>
                <thead><tr><th>Modul</th><th className={c.num}>Panggilan</th><th className={c.num}>Token</th><th className={c.num}>Biaya</th><th className={c.num}>Porsi</th></tr></thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.module}>
                      <td><span className={c.dot} style={{ background: color(m.module) }} />{m.label}</td>
                      <td className={c.num}>{formatNumber(m.calls)}</td>
                      <td className={c.num}>{formatNumber(Math.round(m.tokens))}</td>
                      <td className={c.num}><b>{usd(m.cost)}</b><br /><small>{rp(m.cost, d.kurs)}</small></td>
                      <td className={c.num}>{total ? Math.round((m.cost / total) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={c.card}>
          <header className={c.cardHead}>
            <div><h3>Kategorisasi: IndoBERT vs AI berbayar</h3><p>Post berlabel bulan ini per proyek</p></div>
            <IconRadar size={18} className={c.headIcon} />
          </header>
          {!d ? <Skeleton h={160} radius="lg" /> : !d.labels.length ? <p className={c.empty}>Belum ada post berlabel bulan ini.</p> : d.labels.map((l) => {
            const n = l.local + l.ai, share = n ? Math.round((l.local / n) * 100) : 0;
            return (
              <div key={l.project} className={c.budget}>
                <div><span>{l.project}</span><b>{share}% IndoBERT · {formatNumber(n)} post</b></div>
                <i><span style={{ width: `${share}%`, background: "var(--mantine-color-teal-6)" }} /></i>
              </div>
            );
          })}
          <p className={c.hint}>IndoBERT berjalan di server Signalbase tanpa biaya per post; sisanya dikirim ke penyedia AI berbayar.</p>
        </section>
      </div>

      {d && d.excluded.tokens > 0 && (
        <p className={c.note}><IconInfoCircle size={15} />
          Tidak dihitung bulan ini: {formatNumber(Math.round(d.excluded.tokens))} token ({formatNumber(d.excluded.calls)} panggilan) yang dibayar key lain, yaitu key DeepSeek milik
          klien atau tercatat sebelum 16 Nov 2026 tanpa keterangan key.
        </p>
      )}
    </div>
  );
}

/** Batang biaya per hari, bertumpuk per modul; arahkan kursor untuk rincian. */
function StackedChart({ d, color }: { d: Costs; color: (m: string) => string }) {
  const days = Array.from({ length: 30 }, (_, i) => dayjs(d.today).subtract(29 - i, "day").format("YYYY-MM-DD"));
  const byDay = days.map((day) => ({ day, parts: d.daily.filter((x) => x.day === day && x.cost > 0) }));
  const max = Math.max(0, ...byDay.map((b) => b.parts.reduce((s, p) => s + p.cost, 0)));
  if (!max) return <p className={c.empty}>Belum ada biaya dalam 30 hari terakhir.</p>;
  const label = new Map(d.modules.map((m) => [m.module, m.label]));
  return (
    <div className={c.chart} role="img" aria-label={`Biaya harian 30 hari terakhir, tertinggi ${usd(max)}`}>
      <span className={c.axisMax}>{usd(max)}</span>
      <div className={c.bars}>
        {byDay.map((b, i) => {
          const sum = b.parts.reduce((s, p) => s + p.cost, 0);
          return (
            <div key={b.day} className={c.bar} data-today={i === byDay.length - 1 || undefined}>
              <span className={c.stack} style={{ height: `${sum ? Math.max(3, (sum / max) * 100) : 0}%` }}>
                {b.parts.map((p) => <i key={p.module} style={{ flexGrow: p.cost, background: color(p.module) }} />)}
              </span>
              <span className={c.tip}>
                <b>{usd(sum)} {rp(sum, d.kurs)}</b>{dayjs(b.day).locale("id").format("D MMM")}
                {b.parts.map((p) => <span key={p.module}>{label.get(p.module) ?? p.module}: {usd(p.cost)}</span>)}
              </span>
            </div>
          );
        })}
      </div>
      <div className={c.axis}><span>{dayjs(days[0]).locale("id").format("D MMM")}</span><span>Hari ini</span></div>
    </div>
  );
}
