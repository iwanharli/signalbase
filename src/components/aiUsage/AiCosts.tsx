"use client";
// One project's AI costs paid by Signalbase's own key: categorisation and this project's AI summary. A client's own DeepSeek
// key (e.g. KIPERMAS) is not counted. USD with the Rupiah equivalent (live rate). Shown on the dark AI panel (usage.module.css).
import { IconCoin, IconInfoCircle } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import u from "./usage.module.css";
import c from "./costs.module.css";

type Module = "kategorisasi" | "ringkasan";
type Costs = {
  today: string; usdToIdr: number | null; keyHint: string | null;
  month: { cost: number; calls: number; tokens: number };
  avgDaily: number | null; projection: number | null; basisDays: number; daysInMonth: number;
  modules: { module: Module; calls: number; tokens: number; cost: number }[];
  daily: { day: string; module: Module; cost: number }[];
  labels: { local: number; ai: number };
  excluded: { tokens: number; calls: number };
};

const MODULES: Record<Module, { label: string; color: string }> = {
  kategorisasi: { label: "Kategorisasi", color: "#22d3ee" },
  ringkasan: { label: "Ringkasan AI", color: "#a78bfa" },
};
const usd = (n: number | null) => (n == null ? "—" : `US$${n.toLocaleString("id-ID", { minimumFractionDigits: n > 0 && n < 0.01 ? 4 : 2, maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2 })}`);
const rp = (n: number | null, usdToIdr: number | null) => (n == null || !usdToIdr ? "" : `≈ Rp${Math.round(n * usdToIdr).toLocaleString("id-ID")}`);

export function AiCosts({ keyId }: { keyId: string }) {
  const { data: d, error } = useApi<Costs>(`/api/admin/projects/${keyId}/classifier/costs`);
  // Client accounts may not see internal costs (403): the card is not shown.
  if (error) return null;
  const labelled = d ? d.labels.local + d.labels.ai : 0;

  return (
    <section className={u.card}>
      <header className={u.head}>
        <span className={u.icon}><IconCoin size={16} /></span>
        <div>
          <b>Biaya AI proyek{d ? ` · ${dayjs(d.today).locale("id").format("MMMM YYYY")}` : ""}</b>
          <small>
            Yang dibayar key DeepSeek milik Signalbase{d?.keyHint ? <> <code>…{d.keyHint}</code></> : ""}; key milik instansi tidak dihitung
            {d?.usdToIdr ? ` · kurs Rp${d.usdToIdr.toLocaleString("id-ID")}/USD (live)` : ""}
          </small>
        </div>
      </header>

      {!d ? <div className={u.skeleton} /> : <>
        <div className={`${u.stats} ${c.stats4}`}>
          <div><small>Bulan ini</small><b>{usd(d.month.cost)}</b><span>{rp(d.month.cost, d.usdToIdr) || "—"}</span></div>
          <div><small>Perkiraan sebulan</small><b>{usd(d.projection)}</b><span>{d.basisDays ? rp(d.projection, d.usdToIdr) : "menunggu 1 hari penuh"}</span></div>
          <div><small>Rata-rata</small><b>{usd(d.avgDaily)}</b><span>{d.basisDays ? `per hari · ${d.basisDays} hari terakhir` : "per hari"}</span></div>
          <div><small>Dilabeli IndoBERT</small><b>{labelled ? `${Math.round((d.labels.local / labelled) * 100)}%` : "—"}</b><span>{labelled ? `${formatNumber(d.labels.local)} dari ${formatNumber(labelled)} post · gratis` : "belum ada post bulan ini"}</span></div>
        </div>

        <StackedChart d={d} />
        <div className={c.legend}>{(Object.keys(MODULES) as Module[]).map((m) => <span key={m}><i className={c.dot} style={{ background: MODULES[m].color }} />{MODULES[m].label}</span>)}</div>

        <table className={c.table}>
          <thead><tr><th>Modul</th><th className={c.num}>Panggilan</th><th className={c.num}>Token</th><th className={c.num}>Biaya bulan ini</th></tr></thead>
          <tbody>
            {d.modules.map((m) => (
              <tr key={m.module}>
                <td><span className={c.name}><i className={c.dot} style={{ background: MODULES[m.module].color }} />{MODULES[m.module].label}</span></td>
                <td className={c.num}>{formatNumber(m.calls)}</td>
                <td className={c.num}>{formatNumber(Math.round(m.tokens))}</td>
                <td className={c.num}><b>{usd(m.cost)}</b> <small>{rp(m.cost, d.usdToIdr)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>

        {d.excluded.tokens > 0 && (
          <p className={c.foot}><IconInfoCircle size={15} />
            Tidak dihitung bulan ini: {formatNumber(Math.round(d.excluded.tokens))} token ({formatNumber(d.excluded.calls)} panggilan) yang dibayar key lain, yaitu key
            DeepSeek milik instansi atau tercatat sebelum 16 Nov 2026 tanpa keterangan key.
          </p>
        )}
      </>}
    </section>
  );
}

/** Cost bars per day, stacked per module; hover for details. */
function StackedChart({ d }: { d: Costs }) {
  const days = Array.from({ length: 30 }, (_, i) => dayjs(d.today).subtract(29 - i, "day").format("YYYY-MM-DD"));
  const byDay = days.map((day) => ({ day, parts: d.daily.filter((x) => x.day === day && x.cost > 0) }));
  const max = Math.max(0, ...byDay.map((b) => b.parts.reduce((s, p) => s + p.cost, 0)));
  if (!max) return <p className={c.empty}>Belum ada biaya yang dibayar key Signalbase dalam 30 hari terakhir.</p>;
  return (
    <div className={c.chart} role="img" aria-label={`Biaya harian 30 hari terakhir, tertinggi ${usd(max)}`}>
      <div className={c.bars}>
        <span className={c.max}>{usd(max)}</span>
        {byDay.map((b) => {
          const sum = b.parts.reduce((s, p) => s + p.cost, 0);
          return (
            <div key={b.day} className={c.col}>
              <span className={c.stack} style={{ height: `${sum ? Math.max(3, (sum / max) * 100) : 0}%` }}>
                {b.parts.map((p) => <i key={p.module} style={{ flexGrow: p.cost, background: MODULES[p.module].color }} />)}
              </span>
              {sum > 0 && (
                <span className={c.tip}>
                  <small>{dayjs(b.day).locale("id").format("dddd, D MMM")}</small>
                  <b>{usd(sum)}</b>
                  <span>{rp(sum, d.usdToIdr)}</span>
                  {b.parts.map((p) => <span key={p.module}>{MODULES[p.module].label}: {usd(p.cost)}</span>)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className={c.axis}><span>{dayjs(days[0]).locale("id").format("D MMM")}</span><span>Hari ini</span></div>
    </div>
  );
}
