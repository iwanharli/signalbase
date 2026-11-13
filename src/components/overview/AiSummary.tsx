"use client";
// Ringkasan AI card on Ringkasan / Beranda: the AI briefing of one complete data day (normally yesterday) for the scope
// being viewed. Written by the worker each morning; earlier days can be paged through.
import { useState } from "react";
import Link from "next/link";
import { Skeleton, Tooltip } from "@mantine/core";
import {
  IconAlertTriangle, IconArrowRight, IconChevronDown, IconChevronLeft, IconChevronRight, IconClockHour4, IconExternalLink,
  IconGauge, IconSettings, IconSparkles, IconTargetArrow, IconTrendingDown, IconTrendingUp, IconUsersGroup,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import type { SummaryContent, SummaryResponse, Tone, Trend } from "@/lib/ai/summary";
import { useApi } from "@/lib/useApi";
import { Button } from "../ui/Button";
import c from "./aiSummary.module.css";

const TONE_LABEL: Record<Tone, string> = { positif: "Positif", netral: "Netral", negatif: "Negatif", waspada: "Waspada" };
const TREND: Record<Trend, { label: string; icon: typeof IconTrendingUp }> = {
  baru: { label: "Baru", icon: IconSparkles },
  naik: { label: "Naik", icon: IconTrendingUp },
  stabil: { label: "Stabil", icon: IconArrowRight },
  turun: { label: "Turun", icon: IconTrendingDown },
};
const longDay = (day: string) => dayjs(day).locale("id").format("dddd, D MMMM YYYY");
const shortDay = (day: string) => dayjs(day).locale("id").format("D MMM");

export function AiSummary({ keyId, admin }: { keyId: string | null; admin: boolean }) {
  const [day, setDay] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...(keyId ? { key: keyId } : {}), ...(day ? { day } : {}) }).toString();
  const { data, error } = useApi<SummaryResponse>(`/api/admin/stats/ai-summary${qs ? `?${qs}` : ""}`);

  // Users only see the card once there is something to read.
  if (!admin && (!data?.summary || data.summary.status !== "ok")) return null;
  if (error) return <p className={c.state} data-error><IconAlertTriangle size={16} />Ringkasan AI tidak dapat dimuat: {error}</p>;

  const s = data?.summary ?? null;
  const content = s?.status === "ok" ? s.content : null;
  const index = s ? data!.days.indexOf(s.day) : -1;
  const older = index >= 0 ? data!.days[index + 1] : undefined;
  const newer = index > 0 ? data!.days[index - 1] : undefined;
  const hour = `${String(data?.hour ?? 6).padStart(2, "0")}.00`;
  // Viewing the newest summary while yesterday's is not written yet (before the morning run).
  const pending = !!data && !newer && s?.day !== data.latest && data.enabled;

  return (
    <section className={c.card} aria-busy={!data}>
      <span className={c.glow} aria-hidden />
      <header className={c.head}>
        <span className={c.icon}><IconSparkles size={18} /></span>
        <div className={c.title}>
          <span className={c.eyebrow}>Ringkasan AI · data satu hari penuh</span>
          <h3>{s ? longDay(s.day) : data ? "Belum ada ringkasan" : <Skeleton h={18} w={220} mt={4} />}</h3>
        </div>
        <div className={c.tools}>
          {data && data.days.length > 1 && (
            <div className={c.pager}>
              <button type="button" onClick={() => older && setDay(older)} disabled={!older} aria-label={older ? `Ringkasan ${longDay(older)}` : "Tidak ada ringkasan sebelumnya"}>
                <IconChevronLeft size={16} />
              </button>
              <span>{s ? shortDay(s.day) : ""}</span>
              <button type="button" onClick={() => newer && setDay(newer)} disabled={!newer} aria-label={newer ? `Ringkasan ${longDay(newer)}` : "Tidak ada ringkasan sesudahnya"}>
                <IconChevronRight size={16} />
              </button>
            </div>
          )}
          {admin && <Button size="sm" variant="subtle" iconOnly icon={IconSettings} href="/ai">Pengaturan AI</Button>}
        </div>
      </header>

      {!data && <div className={c.lead}><Skeleton h={28} w="80%" /><Skeleton h={14} w="50%" /><Skeleton h={160} mt={8} radius="lg" /></div>}

      {data && !data.configured && (
        <p className={c.state}>Penyedia AI belum diatur. <Link href="/ai">Atur di Pengaturan AI</Link> untuk mulai menulis ringkasan harian.</p>
      )}
      {data && data.configured && !s && (
        <p className={c.state}><IconClockHour4 size={16} />
          {data.enabled ? <>Ringkasan pertama untuk data {longDay(data.latest)} ditulis otomatis pukul {hour} WIB.</> : <>Ringkasan harian sedang dimatikan di Pengaturan AI.</>}
        </p>
      )}
      {s?.status === "failed" && (
        <p className={c.state} data-error><IconAlertTriangle size={16} />Ringkasan data {longDay(s.day)} gagal ditulis{s.error ? `: ${s.error}` : "."}</p>
      )}

      {content && <>
        <div className={c.lead}>
          <h2 className={c.headline}>{content.headline}</h2>
          <div className={c.chips}>
            <span className={c.chip} data-tone={content.sentiment.tone}><i />Opini {TONE_LABEL[content.sentiment.tone].toLowerCase()}</span>
            {content.confidence && (
              <Tooltip label={content.confidence.note} multiline w={300} withArrow position="bottom">
                <span className={c.chip} data-confidence={content.confidence.level} tabIndex={0}><IconGauge size={13} />Keyakinan {content.confidence.level}</span>
              </Tooltip>
            )}
            <span className={c.sentimentNote}>{content.sentiment.note}</span>
          </div>
        </div>

        <div className={c.layout}>
          <div className={c.main}>
            <p className={c.overview}>{content.overview}</p>
            {content.publicConversation && <PublicConversation p={content.publicConversation} sources={content.sources} />}
            <h4 className={c.section}>Sorotan</h4>
            <ol className={c.highlights}>
              {content.highlights.map((h, i) => <Highlight key={`${s!.day}-${i}`} h={h} index={i} sources={content.sources} />)}
            </ol>
          </div>

          {(content.watch.length > 0 || content.actions.length > 0) && (
            <aside className={c.side}>
              {content.watch.length > 0 && (
                <div className={c.box} data-kind="watch">
                  <h4><IconAlertTriangle size={15} />Perlu diwaspadai hari ini</h4>
                  <ul>{content.watch.map((w, i) => <li key={i}>{w.text}</li>)}</ul>
                </div>
              )}
              {content.actions.length > 0 && (
                <div className={c.box} data-kind="actions">
                  <h4><IconTargetArrow size={15} />Rekomendasi</h4>
                  <ol>{content.actions.map((x, i) => <li key={i}><b>{x.action}</b>{x.reason && <small>{x.reason}</small>}</li>)}</ol>
                </div>
              )}
            </aside>
          )}
        </div>

        <footer className={c.foot}>
          <span>Ditulis AI {dayjs(s!.updatedAt).locale("id").format("dddd HH.mm")}. Periksa kembali sebelum dijadikan dasar keputusan.</span>
          {pending && <span><IconClockHour4 size={13} />Ringkasan data {longDay(data!.latest)} ditulis pukul {hour} WIB.</span>}
        </footer>
      </>}
    </section>
  );
}

/** Links to the posts, news and issues a statement rests on (plain text when the source has no URL). */
function SourceLinks({ codes, sources }: { codes: string[]; sources: SummaryContent["sources"] }) {
  const refs = codes.flatMap((code) => (sources[code] ? [{ code, ...sources[code] }] : []));
  if (!refs.length) return null;
  return (
    <div className={c.sources}>
      {refs.map((r) => r.url
        ? <a key={r.code} href={r.url} target="_blank" rel="noopener noreferrer" title={r.label}><IconExternalLink size={11} />{r.label}</a>
        : <span key={r.code} title={r.label}>{r.label}</span>)}
    </div>
  );
}

/** What the public itself says on social media, apart from outlets and institutions. */
function PublicConversation({ p, sources }: { p: NonNullable<SummaryContent["publicConversation"]>; sources: SummaryContent["sources"] }) {
  return (
    <div className={c.public}>
      <h4><IconUsersGroup size={15} />Percakapan publik di media sosial</h4>
      <p>{p.summary}</p>
      {p.drivers.length > 0 && (
        <div className={c.drivers}><span>Penggerak</span>{p.drivers.map((d) => <b key={d}>{d}</b>)}</div>
      )}
      {p.vsMedia && <p className={c.vsMedia}><span>Dibanding media</span>{p.vsMedia}</p>}
      <SourceLinks codes={p.evidence} sources={sources} />
    </div>
  );
}

type HighlightItem = SummaryContent["highlights"][number];

/** One numbered highlight. The fact is always shown; the assessment and sources open on demand (the first one starts open). */
function Highlight({ h, index, sources }: { h: HighlightItem; index: number; sources: SummaryContent["sources"] }) {
  const [open, setOpen] = useState(index === 0);
  const sentiment = h.sentiment ?? h.tone ?? "netral";
  const trend = h.trend ? TREND[h.trend] : null;
  const refs = h.evidence.flatMap((code) => (sources[code] ? [{ code, ...sources[code] }] : []));
  const more = !!h.implication || refs.length > 0;
  return (
    <li className={c.item} data-impact={h.impact ?? "sedang"} data-open={open || undefined} style={{ animationDelay: `${index * 60}ms` }}>
      <span className={c.num}>{index + 1}</span>
      <div className={c.itemBody}>
        <div className={c.itemHead}>
          <b>{h.title}</b>
          <span className={c.tags}>
            {h.impact && <span className={c.impact}>Dampak {h.impact}</span>}
            {trend && <span className={c.trend} data-trend={h.trend}><trend.icon size={12} />{trend.label}</span>}
            <span className={c.mood} data-tone={sentiment}>{TONE_LABEL[sentiment]}</span>
          </span>
        </div>
        <p className={c.detail}>{h.detail}</p>
        {open && more && (
          <div className={c.more}>
            {h.implication && <p><span>Implikasi</span>{h.implication}</p>}
            <SourceLinks codes={h.evidence} sources={sources} />
          </div>
        )}
        {more && (
          <button type="button" className={c.toggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Tutup analisis" : `Analisis${refs.length ? ` & ${refs.length} sumber` : ""}`}<IconChevronDown size={14} />
          </button>
        )}
      </div>
    </li>
  );
}
