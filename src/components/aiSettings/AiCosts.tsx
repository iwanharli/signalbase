"use client";
// Biaya AI satu proyek yang dibayar key milik Signalbase: kategorisasi dan Ringkasan AI proyek ini. Key DeepSeek milik
// klien (mis. KIPERMAS) tidak dihitung. Angka dalam USD dengan padanan Rupiah (kurs live).
import { Skeleton } from "@mantine/core";
import { IconCoin, IconInfoCircle } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import c from "./aiSettings.module.css";

type Module = "kategorisasi" | "ringkasan";
type Costs = {
  today: string; kurs: number | null; keyHint: string | null;
  month: { cost: number; calls: number; tokens: number };
  avgDaily: number | null; projection: number | null; basisDays: number; daysInMonth: number;
  modules: { module: Module; calls: number; tokens: number; cost: number }[];
  daily: { day: string; module: Module; cost: number }[];
  labels: { local: number; ai: number };
  excluded: { tokens: number; calls: number };
};

const MODULES: Record<Module, { label: string; color: string }> = {
  kategorisasi: { label: "Kategorisasi", color: "#0891b2" },
  ringkasan: { label: "Ringkasan AI", color: "#7c3aed" },
};
const usd = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: n > 0 && n < 0.01 ? 4 : 2, maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2 })}`);
const rp = (n: number | null, kurs: number | null) => (n == null || !kurs ? "" : `≈ Rp${Math.round(n * kurs).toLocaleString("id-ID")}`);

export function AiCosts({ keyId }: { keyId: string }) {
  const { data: d, error } = useApi<Costs>(`/api/admin/keys/${keyId}/classifier/costs`);
  const labelled = d ? d.labels.local + d.labels.ai : 0;
  const localShare = labelled ? Math.round((d!.labels.local / labelled) * 100) : null;

  // Akun klien tidak berhak melihat biaya internal (403): kartu tidak ditampilkan.
  if (error) return null;
  return (
    <section className={c.card}>
      <header className={c.cardHead}>
        <div>
          <h3>Biaya AI proyek · {d ? dayjs(d.today).locale("id").format("MMMM YYYY") : "bulan ini"}</h3>
          <p>
            Yang dibayar key DeepSeek milik Signalbase{d?.keyHint ? <> (<code>…{d.keyHint}</code>)</> : ""}; key milik klien tidak dihitung.
            {d?.kurs ? ` Kurs Rp${d.kurs.toLocaleString("id-ID")}/USD (live).` : ""}
          </p>
        </div>
        <IconCoin size={18} className={c.headIcon} />
      </header>

      {!d ? <Skeleton h={300} radius="lg" /> : <>
        <dl className={c.totals} data-cols="4">
          <div><dt>Bulan ini</dt><dd>{usd(d.month.cost)}</dd><small>{rp(d.month.cost, d.kurs)}</small></div>
          <div><dt>Perkiraan sebulan</dt><dd>{usd(d.projection)}</dd><small>{d.basisDays ? rp(d.projection, d.kurs) : "menunggu 1 hari penuh"}</small></div>
          <div><dt>Rata-rata per hari</dt><dd>{usd(d.avgDaily)}</dd><small>{d.basisDays ? `${d.basisDays} hari terakhir` : "—"}</small></div>
          <div><dt>Dilabeli IndoBERT</dt><dd>{localShare == null ? "—" : `${localShare}%`}</dd><small>{labelled ? `${formatNumber(d.labels.local)} dari ${formatNumber(labelled)} post, gratis` : "belum ada post bulan ini"}</small></div>
        </dl>

        <StackedChart d={d} />
        <div className={c.legend}>{(Object.keys(MODULES) as Module[]).map((m) => <span key={m}><i style={{ background: MODULES[m].color }} />{MODULES[m].label}</span>)}</div>

        <div className={c.tableWrap} data-flush>
          <table className={c.table}>
            <thead><tr><th>Modul</th><th className={c.num}>Panggilan</th><th className={c.num}>Token</th><th className={c.num}>Biaya</th></tr></thead>
            <tbody>
              {d.modules.map((m) => (
                <tr key={m.module}>
                  <td><span className={c.dot} style={{ background: MODULES[m.module].color }} />{MODULES[m.module].label}</td>
                  <td className={c.num}>{formatNumber(m.calls)}</td>
                  <td className={c.num}>{formatNumber(Math.round(m.tokens))}</td>
                  <td className={c.num}><b>{usd(m.cost)}</b> <small>{rp(m.cost, d.kurs)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {d.excluded.tokens > 0 && (
          <p className={c.note}><IconInfoCircle size={15} />
            Tidak dihitung bulan ini: {formatNumber(Math.round(d.excluded.tokens))} token ({formatNumber(d.excluded.calls)} panggilan) yang dibayar key lain, yaitu key DeepSeek
            milik klien atau tercatat sebelum 16 Nov 2026 tanpa keterangan key.
          </p>
        )}
      </>}
    </section>
  );
}

/** Batang biaya per hari, bertumpuk per modul; arahkan kursor untuk rincian. */
function StackedChart({ d }: { d: Costs }) {
  const days = Array.from({ length: 30 }, (_, i) => dayjs(d.today).subtract(29 - i, "day").format("YYYY-MM-DD"));
  const byDay = days.map((day) => ({ day, parts: d.daily.filter((x) => x.day === day && x.cost > 0) }));
  const max = Math.max(0, ...byDay.map((b) => b.parts.reduce((s, p) => s + p.cost, 0)));
  if (!max) return <p className={c.empty}>Belum ada biaya dalam 30 hari terakhir.</p>;
  return (
    <div className={c.chart} role="img" aria-label={`Biaya harian 30 hari terakhir, tertinggi ${usd(max)}`}>
      <span className={c.axisMax}>{usd(max)}</span>
      <div className={c.bars}>
        {byDay.map((b, i) => {
          const sum = b.parts.reduce((s, p) => s + p.cost, 0);
          return (
            <div key={b.day} className={c.bar} data-today={i === byDay.length - 1 || undefined}>
              <span className={c.stack} style={{ height: `${sum ? Math.max(3, (sum / max) * 100) : 0}%` }}>
                {b.parts.map((p) => <i key={p.module} style={{ flexGrow: p.cost, background: MODULES[p.module].color }} />)}
              </span>
              <span className={c.tip}>
                <b>{usd(sum)} {rp(sum, d.kurs)}</b>{dayjs(b.day).locale("id").format("D MMM")}
                {b.parts.map((p) => <span key={p.module}>{MODULES[p.module].label}: {usd(p.cost)}</span>)}
              </span>
            </div>
          );
        })}
      </div>
      <div className={c.axis}><span>{dayjs(days[0]).locale("id").format("D MMM")}</span><span>Hari ini</span></div>
    </div>
  );
}
