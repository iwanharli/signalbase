"use client";
// Laporan menu: the archive of executive reports the worker writes once a period is over (harian every morning, mingguan
// on Monday, bulanan on the 1st), as cards with a cover, newest first. A card opens the stored report in a new tab
// (/laporan?id=), where it can be downloaded as PDF or printed. A custom report over the hours up to now is still available.
import { useEffect, useState } from "react";
import { Modal, SegmentedControl, Select, Skeleton, TagsInput, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAdjustmentsHorizontal, IconArrowUpRight, IconCalendarEvent, IconCalendarMonth, IconCalendarWeek, IconClockHour4, IconFileDescription, IconFileDownload, IconUserCircle } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import type { ArchiveResponse } from "@/app/api/admin/reports/route";
import { DEFAULT_SIFAT, KIND_LABEL, periodLabel, REPORT_KINDS, REPORT_PERIODS, weekOfYear, type ReportCover, type ReportKind } from "@/lib/report";
import { api } from "@/lib/api-client";
import type { BriefProfile } from "@/lib/brief";
import { useApi } from "@/lib/useApi";
import { LogoMark } from "../Logo";
import { useRole } from "../RoleContext";
import { Button } from "../ui/Button";
import c from "./reportArchive.module.css";

const KIND_ICON = { harian: IconCalendarEvent, mingguan: IconCalendarWeek, bulanan: IconCalendarMonth } as const;
const SCHEDULE: Record<ReportKind, string> = {
  harian: "Disusun otomatis setiap pagi dari data kemarin (satu hari penuh).",
  mingguan: "Disusun otomatis setiap Senin pagi dari data Senin–Minggu sebelumnya.",
  bulanan: "Disusun otomatis setiap tanggal 1 dari data satu bulan penuh sebelumnya.",
};
const compact = (n: number | null) => (n === null ? "—" : new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n));
type Item = ArchiveResponse["reports"][number];

export function ReportArchive() {
  const role = useRole();
  const admin = role !== "user"; // admins and viewers see the whole bank
  const canEdit = role !== "viewer";
  const [kind, setKind] = useState<ReportKind>("harian");
  const [scope, setScope] = useState<string | null>(null);
  const { data, error, loading } = useApi<ArchiveResponse>(`/api/admin/reports?kind=${kind}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`);
  const [dialog, setDialog] = useState<"profile" | "custom" | null>(null);
  const href = (id: string) => `/laporan?${new URLSearchParams({ id })}`;

  const reports = data?.kind === kind ? data.reports : [];
  const [latest, ...rest] = reports;
  const months = groupByMonth(rest);
  const scopeName = data?.scopes.find((s) => s.id === data.scope)?.name;

  return (
    <div className={c.page}>
      <header className={c.hero}>
        <div className={c.heroGrid} aria-hidden />
        <div className={c.heroText}>
          <span className={c.badge}><IconFileDescription size={13} />Arsip laporan</span>
          <h1>Laporan <em>eksekutif</em></h1>
          <p>Laporan siap cetak yang disusun otomatis setelah periodenya selesai, sehingga datanya selalu lengkap. Buka untuk mengunduh PDF atau mencetak.</p>
        </div>
        <div className={c.heroActions}>
          {canEdit && <Button variant="secondary" onDark icon={IconUserCircle} onClick={() => setDialog("profile")} disabled={!data?.scope}>Profil laporan</Button>}
          <Button variant="primary" icon={IconAdjustmentsHorizontal} onClick={() => setDialog("custom")}>Laporan kustom</Button>
        </div>
      </header>

      <div className={c.toolbar}>
        <SegmentedControl value={kind} onChange={(v) => setKind(v as ReportKind)} aria-label="Jenis laporan" radius="xl"
          data={REPORT_KINDS.map((k) => { const Icon = KIND_ICON[k]; return { value: k, label: <span className={c.seg}><Icon size={15} />{KIND_LABEL[k]}</span> }; })} />
        {data && data.scopes.length > 1 && (
          <Select aria-label="Cakupan" value={data.scope} onChange={(v) => v && setScope(v)} allowDeselect={false} w={240}
            data={data.scopes.map((s) => ({ value: s.id, label: s.name }))} />
        )}
        <span className={c.schedule}><IconClockHour4 size={14} />{SCHEDULE[kind]} Berikutnya: <b>{nextRun(kind)}</b>.</span>
      </div>

      {canEdit && data && !data.profileSet && data.scope && (
        <div className={c.notice}>
          <IconUserCircle size={20} />
          <p><b>Profil laporan {scopeName} belum diisi.</b> Analisis masih ditulis untuk pimpinan secara umum. Isi jabatan penerima dan institusi agar setiap temuan, implikasi, dan tindakan ditulis dari sudut pandang keputusan mereka.</p>
          <Button size="sm" variant="primary" onClick={() => setDialog("profile")}>Isi profil</Button>
        </div>
      )}

      {error && <p className={c.empty}>{error}</p>}
      {!data && !error && <div className={c.featured}><Skeleton h={320} radius="lg" /></div>}
      {data && !reports.length && !loading && (
        <p className={c.empty}>Belum ada laporan {KIND_LABEL[kind].toLowerCase()}{scopeName ? ` untuk ${scopeName}` : ""}. {SCHEDULE[kind]}</p>
      )}

      {latest && (
        <a className={c.featured} href={href(latest.id)} target="_blank" rel="noopener noreferrer" aria-busy={loading || undefined}>
          <Cover kind={kind} item={latest} large />
          <div className={c.featuredBody}>
            <div className={c.featuredHead}>
              <span className={c.newest}>Terbaru</span>
              {data?.latest && <span className={c.docNo}>No. {data.latest.number}</span>}
            </div>
            <h2>Laporan {KIND_LABEL[kind].toLowerCase()} · {periodLabel({ days: 0, start: latest.start, day: latest.day })}</h2>
            <p className={c.period}>{latest.scopeName}{data?.latest?.recipient ? ` · untuk ${data.latest.recipient}` : ""}</p>
            {data?.latest?.summary && (
              <div className={c.gist} style={{ ["--heat" as string]: latest.cover.heatColor }}>
                <b><i />Suhu {latest.cover.heat}{data.latest.momentum ? ` · momentum ${data.latest.momentum.toLowerCase()}` : ""}</b>
                <p>{data.latest.summary}</p>
              </div>
            )}
            {data?.latest && data.latest.decisions.length > 0 && (
              <div className={c.decisions}>
                <small>Keputusan yang dibutuhkan</small>
                <ol>{data.latest.decisions.slice(0, 4).map((x, i) => <li key={i}><span>{x.judul}</span><em>{x.tenggat}</em></li>)}</ol>
              </div>
            )}
            <dl className={c.stats}>
              <Stat label="Media sosial" value={compact(latest.cover.social)} />
              <Stat label="Media online" value={compact(latest.cover.online)} />
              <Stat label="Negatif sosmed" value={latest.cover.negSocial === null ? "—" : `${latest.cover.negSocial.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} />
              <Stat label="Isu peringatan dini" value={`${latest.cover.issues}`} hint={latest.cover.critical ? `${latest.cover.critical} critical` : undefined} />
              <Stat label={`Volume vs ${kind === "harian" ? "hari" : "periode"} sebelumnya`} value={latest.cover.change === null ? "—" : `${latest.cover.change > 0 ? "+" : ""}${latest.cover.change}%`} />
              <Stat label="Status isu" value={latest.cover.heat} color={latest.cover.heatColor} />
            </dl>
            <span className={c.open}><IconFileDownload size={16} />Buka laporan<IconArrowUpRight size={15} /></span>
          </div>
        </a>
      )}

      {reports.length > 2 && <HeatStrip reports={reports} kind={kind} href={href} />}

      {months.map(([month, items]) => (
        <section key={month} className={c.month}>
          <h3>{month}</h3>
          <div className={c.grid}>
            {items.map((r, i) => (
              <a key={r.id} className={c.card} href={href(r.id)} target="_blank" rel="noopener noreferrer" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                <Cover kind={kind} item={r} />
                <div className={c.caption}>
                  <b>{periodLabel({ days: 0, start: r.start, day: r.day })}</b>
                  {r.cover.change !== null && <span data-down={r.cover.change < 0 || undefined}>{r.cover.change > 0 ? "+" : ""}{r.cover.change}%</span>}
                </div>
              </a>
            ))}
          </div>
        </section>
      ))}

      <Modal opened={dialog === "profile"} onClose={() => setDialog(null)} title={`Profil laporan · ${scopeName ?? ""}`} centered radius="lg" size="lg">
        {data?.scope && <ProfileForm scope={data.scope} onSaved={() => setDialog(null)} />}
      </Modal>
      <Modal opened={dialog === "custom"} onClose={() => setDialog(null)} title="Laporan kustom" centered radius="lg">
        <CustomReport scopes={data?.scopes ?? []} admin={admin} onOpen={() => setDialog(null)} />
      </Modal>
    </div>
  );
}

/** Reports grouped under their month ("November 2026"), keeping the newest-first order. */
function groupByMonth(items: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  for (const r of items) {
    const label = dayjs(r.day).locale("id").format("MMMM YYYY");
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  return [...groups];
}

/** When the next report of a kind is written, in Jakarta time. */
function nextRun(kind: ReportKind) {
  const now = dayjs().locale("id");
  const today6 = now.hour(6).minute(0);
  if (kind === "harian") return (now.isBefore(today6) ? today6 : today6.add(1, "day")).format("dddd, D MMM · 06.00");
  if (kind === "mingguan") {
    const daysToMonday = (8 - now.day()) % 7;
    const monday = today6.add(daysToMonday, "day");
    return (daysToMonday === 0 && now.isBefore(today6) ? monday : daysToMonday === 0 ? monday.add(7, "day") : monday).format("dddd, D MMM · 06.00");
  }
  const first = today6.date(1);
  return (now.date() === 1 && now.isBefore(today6) ? first : first.add(1, "month")).format("D MMMM YYYY · 06.00");
}

/** Issue status over the archive, oldest to newest: one bar per report, height = volume, colour = status. */
function HeatStrip({ reports, kind, href }: { reports: Item[]; kind: ReportKind; href: (id: string) => string }) {
  const rows = [...reports].slice(0, 45).reverse();
  const volume = (r: Item) => (r.cover.social ?? 0) + (r.cover.online ?? 0);
  const max = Math.max(1, ...rows.map(volume));
  const counts = ["TINGGI", "WASPADA", "TERKENDALI"].map((h) => [h, rows.filter((r) => r.cover.heat === h).length] as const);
  const unit = kind === "harian" ? "hari" : kind === "mingguan" ? "minggu" : "bulan";
  return (
    <section className={c.strip}>
      <header>
        <div><h3>Riwayat suhu isu</h3><p>{rows.length} laporan terakhir · tinggi batang = volume unggahan + berita</p></div>
        <ul>{counts.map(([h, n]) => <li key={h} data-heat={h}><i />{n} {unit} {h.toLowerCase()}</li>)}</ul>
      </header>
      <div className={c.stripBars}>
        {rows.map((r) => (
          <a key={r.id} href={href(r.id)} target="_blank" rel="noopener noreferrer" style={{ ["--heat" as string]: r.cover.heatColor }}
            title={`${periodLabel({ days: 0, start: r.start, day: r.day })} · ${r.cover.heat} · ${compact(volume(r))} item · ${r.cover.issues} isu EWS`}>
            <i style={{ height: `${Math.max(8, (volume(r) / max) * 100)}%` }} />
            <small>{kind === "bulanan" ? dayjs(r.day).locale("id").format("MMM") : dayjs(r.day).format("D/M")}</small>
          </a>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd style={color ? { color } : undefined}>{value}{hint && <small>{hint}</small>}</dd>
    </div>
  );
}

/** The card cover: dark, lit by the period's issue status, with the period set large and the key numbers below. */
function Cover({ kind, item, large }: { kind: ReportKind; item: Item; large?: boolean }) {
  const end = dayjs(item.day).locale("id"), start = dayjs(item.start).locale("id");
  const cv: ReportCover = item.cover;
  const date = kind === "harian"
    ? { top: end.format("dddd"), big: end.format("D"), bottom: end.format("MMMM YYYY") }
    : kind === "mingguan"
      ? { top: `Minggu ke-${weekOfYear(item.start)}`, big: `${start.format("D")}–${end.format("D")}`,
        bottom: start.isSame(end, "month") ? end.format("MMMM YYYY") : `${start.format("MMM")}–${end.format("MMM YYYY")}` }
      : { top: "Bulan", big: end.format("MMMM"), bottom: end.format("YYYY") };
  return (
    <div className={c.cover} data-large={large || undefined} data-kind={kind} style={{ ["--heat" as string]: cv.heatColor }}>
      <span className={c.mesh} aria-hidden />
      <span className={c.lines} aria-hidden />
      <div className={c.coverTop}>
        <span className={c.brand}><LogoMark size={large ? 20 : 16} /><span>Signalbase</span></span>
        <span className={c.kind}>{KIND_LABEL[kind]}</span>
      </div>
      <div className={c.coverDate}>
        <small>{date.top}</small>
        <b data-long={date.big.length > 6 || undefined}>{date.big}</b>
        <span>{date.bottom}</span>
      </div>
      <div className={c.coverTitle}>
        <small>Laporan eksekutif</small>
        <span>{item.scopeName}</span>
      </div>
      <div className={c.coverStats}>
        <span className={c.heat}><i />{cv.heat}</span>
        <span><small>Sosmed</small>{compact(cv.social)}</span>
        <span><small>Online</small>{compact(cv.online)}</span>
        <span><small>Isu</small>{cv.issues}</span>
      </div>
    </div>
  );
}

/** Who the scope's reports are written for. Used by the next reports written; archived ones keep their own. */
function ProfileForm({ scope, onSaved }: { scope: string; onSaved: () => void }) {
  const { data } = useApi<BriefProfile>(`/api/admin/reports/profile?scope=${encodeURIComponent(scope)}`);
  const [form, setForm] = useState<BriefProfile | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (!form) return <Skeleton h={320} radius="md" />;
  const set = <K extends keyof BriefProfile>(k: K, v: BriefProfile[K]) => setForm({ ...form, [k]: v });
  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/admin/reports/profile?scope=${encodeURIComponent(scope)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      notifications.show({ color: "teal", message: "Profil laporan disimpan. Berlaku untuk laporan berikutnya." });
      onSaved();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally { setSaving(false); }
  };
  return (
    <div className={c.form}>
      <p className={c.note}>Analisis laporan ditulis dari sudut pandang institusi ini: apa yang harus diputuskan penerima. Berlaku untuk laporan yang disusun setelah disimpan.</p>
      <div className={c.formRow}>
        <TextInput label="Jabatan penerima" placeholder="Contoh: Kapolda Riau" value={form.recipientTitle} onChange={(e) => set("recipientTitle", e.currentTarget.value)} />
        <TextInput label="Nama penerima" placeholder="Nama lengkap dan gelar" value={form.recipientName} onChange={(e) => set("recipientName", e.currentTarget.value)} />
      </div>
      <div className={c.formRow}>
        <TextInput label="Institusi (sudut pandang)" placeholder="Contoh: Polda Riau" value={form.institution} onChange={(e) => set("institution", e.currentTarget.value)} />
        <TextInput label="Wilayah" placeholder="Contoh: Provinsi Riau" value={form.region} onChange={(e) => set("region", e.currentTarget.value)} />
      </div>
      <TagsInput label="Mitra koordinasi" description="Pihak yang relevan untuk koordinasi. Tekan Enter setelah tiap nama." placeholder="Contoh: Gubernur, Kajati, Danrem"
        value={form.partners} onChange={(v) => set("partners", v)} maxTags={12} />
      <TextInput label="Sifat dokumen" description="Dicetak di setiap halaman." value={form.sifat} onChange={(e) => set("sifat", e.currentTarget.value)} />
      <div className={c.formActions}><Button variant="primary" onClick={save} loading={saving}>Simpan profil</Button></div>
    </div>
  );
}

/** The report over the hours up to now (1, 3 or 7 days), built on request instead of taken from the archive. */
function CustomReport({ scopes, admin, onOpen }: { scopes: ArchiveResponse["scopes"]; admin: boolean; onOpen: () => void }) {
  const projects = scopes.filter((s) => s.id !== "bank");
  const sources = [
    ...(admin ? [{ value: "all", label: "Semua data" }] : projects.length > 1 ? [{ value: "all", label: "Semua proyek saya" }] : []),
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];
  const [key, setKey] = useState<string | null>(null);
  const [days, setDays] = useState("1");
  const source = key ?? sources[0]?.value ?? null;
  const open = () => {
    if (!source) return;
    window.open(`/laporan?${new URLSearchParams({ days, key: source, sifat: DEFAULT_SIFAT })}`, "_blank");
    onOpen();
  };
  if (!sources.length) return <p className={c.note}>Belum ada proyek aktif.</p>;
  return (
    <div className={c.form}>
      <p className={c.note}>Laporan dari data hingga saat ini, tanpa menunggu periode selesai. Hari ini belum lengkap.</p>
      <Select label="Sumber data" data={sources} value={source} onChange={setKey} allowDeselect={false} />
      <div>
        <span className={c.label}>Periode</span>
        <SegmentedControl fullWidth aria-label="Periode laporan" value={days} onChange={setDays} data={REPORT_PERIODS.map((p) => ({ value: String(p), label: `${p} hari terakhir` }))} />
      </div>
      <div className={c.formActions}><Button variant="primary" icon={IconFileDownload} onClick={open}>Buka laporan</Button></div>
    </div>
  );
}
