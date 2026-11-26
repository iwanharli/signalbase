"use client";
import { useEffect, useState } from "react";
import { IconAdjustmentsHorizontal, IconCalendar, IconFlame, IconLanguage, IconMapPin, IconMessage, IconMoodSmile, IconNews, IconRobot, IconSparkles, IconTag, IconTags, IconX } from "@tabler/icons-react";
import { ANY_CATEGORY, LOW_CONFIDENCE_FILTER, NO_CATEGORY, type Category } from "@/lib/ai/classifier";
import { defaultFilters, type MediaFilters } from "@/lib/media/filters";
import { ANY_LABEL, LABEL_FILTER_NAMES } from "@/lib/media/manualLabels";
import { capitalize, formatNumber, humanize, MOOD_KIND_LABEL, POST_TYPE_LABEL, SOURCE_KIND_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodInfo } from "@/lib/media/mood";
import type { FilterOptions, MediaType } from "@/lib/media/types";
import { DarkSelect, DateRange, Field, Segmented } from "./controls";
import { PlatformMark } from "./PlatformIcon";
import { applyRules } from "./useMediaFilters";
import classes from "./filters.module.css";

const ANALYZED_OPTIONS = [{ value: "yes", label: "Sudah dianalisis" }, { value: "no", label: "Belum" }, { value: "", label: "Semua" }] as const;
const RELEVANCE_OPTIONS = [
  { value: "relevant", label: "Relevan" }, { value: "watchlist", label: "Watchlist" }, { value: "exclude", label: "Tidak relevan" }, { value: "", label: "Semua" },
] as const;
const LEVEL_OPTIONS = [2, 3, 4, 5].map((n) => ({ value: String(n), label: `≥ ${n} dari 5` }));
const LANGUAGE_OPTIONS = [{ value: "id", label: "Indonesia" }, { value: "other", label: "Bahasa lain" }];
const IMAGE_OPTIONS = [{ value: "", label: "Semua" }, { value: "yes", label: "Hanya bergambar" }] as const;
const SOURCE_DROPDOWN_LIMIT = 80;

/** An active project that covers this media type, as a choice for the Proyek field. */

/** Titled group of fields laid out on a two-column grid. */
function Section({ icon: Icon, title, children }: { icon: typeof IconNews; title: string; children: React.ReactNode }) {
  return (
    <section className={classes.section}>
      <h4 className={classes.sectionTitle}><Icon size={13} />{title}</h4>
      <div className={classes.sectionGrid}>{children}</div>
    </section>
  );
}

/** Closes on Escape while `enabled` (disabled while the detail modal owns the key). */
function useEscape(enabled: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onEscape]);
}

/** Left drawer with every filter. Pushes the page on wide screens, overlays it on small ones. Choices go into a draft and
 *  only load data when applied ("Terapkan"); closing the drawer drops the draft. */
export function AdvancedFilters({ type, open, onClose, escapeEnabled, filters: applied, onChange: apply, options, aiCategories, manualLabels, activeCount, advancedCount, total }: {
  type: MediaType;
  open: boolean;
  onClose: () => void;
  escapeEnabled: boolean;
  filters: MediaFilters;
  onChange: (patch: Partial<MediaFilters>) => void;
  options: FilterOptions | null;
  /** User accounts always browse through a project, so theirs cannot be cleared. */
  activeCount: number;
  advancedCount: number;
  /** Exact total for the current filters, or null while counting. */
  total: number | null;
  /** Categories of the API key being browsed through, when it uses AI categorisation. */
  aiCategories?: Category[] | null;
  /** Manual label choices of the project being viewed (separate from AI categorisation); none = no section. */
  manualLabels?: string[] | null;
}) {
  useEscape(open && escapeEnabled, onClose);
  const [filters, setDraft] = useState(applied);
  const appliedKey = JSON.stringify(applied);
  // A fresh draft from what is applied, on opening and whenever the applied filters change (e.g. a chip removed).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(applied), [open, appliedKey]);
  const onChange = (patch: Partial<MediaFilters>) => setDraft((d) => applyRules({ ...d, ...patch }, patch));
  const changed = (Object.keys(applied) as (keyof MediaFilters)[]).filter((k) => applied[k] !== filters[k]).length;
  const resetDraft = () => setDraft({ ...defaultFilters(type), search: applied.search, sort: applied.sort, key: applied.key });
  const submit = () => { if (changed) apply(filters); onClose(); };
  const social = type === "social";
  const unanalyzed = filters.analyzed === "no";

  return (
    <>
      <div className={classes.scrim} data-open={open || undefined} onClick={onClose} aria-hidden />
      <aside id="advanced-filters" className={classes.drawer} data-open={open || undefined} aria-hidden={!open} inert={!open}>
        <div className={classes.panel}>
          <header className={classes.panelHeader}>
            <div className={classes.panelTitle}>
              <IconAdjustmentsHorizontal size={18} />Filter lanjutan{advancedCount > 0 && <span>{advancedCount} aktif</span>}{changed > 0 && <span data-pending>{changed} belum diterapkan</span>}
            </div>
            <button type="button" className={classes.close} onClick={onClose} aria-label="Tutup"><IconX size={18} /></button>
          </header>

          <div className={classes.panelBody}>
            {!!manualLabels?.length && (
              <Section icon={IconTags} title="Label manual">
                <Field label="Label" wide>
                  <DarkSelect leftSection={<IconTags size={15} />} placeholder="Semua post" value={filters.manualLabel}
                    data={[{ value: ANY_LABEL, label: "Semua yang sudah diberi label" },
                      // An AI result filter comes from the project page's links; listed only while it is applied.
                      ...(filters.manualLabel && filters.manualLabel !== ANY_LABEL && LABEL_FILTER_NAMES[filters.manualLabel] ? [{ value: filters.manualLabel, label: LABEL_FILTER_NAMES[filters.manualLabel] }] : []),
                      ...manualLabels.map((l) => ({ value: l, label: l }))]}
                    onChange={(manualLabel) => onChange({ manualLabel })} />
                </Field>
              </Section>
            )}
            {aiCategories && (
              <Section icon={IconRobot} title="Kategorisasi AI">
                <Field label="Kategori AI" wide>
                  <DarkSelect leftSection={<IconRobot size={15} />} placeholder="Semua kategori" value={filters.aiCategory}
                    data={[{ value: ANY_CATEGORY, label: "Semua yang sudah dikategorikan" }, { value: LOW_CONFIDENCE_FILTER, label: "Keyakinan rendah (< 60%), belum dikoreksi" }, ...aiCategories.map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` })), { value: NO_CATEGORY, label: "Tidak termasuk" }]}
                    onChange={(aiCategory) => onChange({ aiCategory })} />
                </Field>
              </Section>
            )}
            <fieldset className={classes.filterGroup}>
            <Section icon={IconSparkles} title="Analisis AI">
              <Field label={social ? "Label emosi" : "Label sentimen"} wide>
                <Segmented full options={ANALYZED_OPTIONS} value={filters.analyzed} onChange={(analyzed) => onChange({ analyzed })} />
              </Field>
              {social && (
                <Field label="Relevansi" wide>
                  <Segmented full options={RELEVANCE_OPTIONS} value={filters.relevance} onChange={(relevance) => onChange({ relevance })} />
                </Field>
              )}
              <Field label={MOOD_KIND_LABEL[type]} wide={!social}>
                <DarkSelect leftSection={<IconMoodSmile size={15} />} placeholder="Semua" disabled={unanalyzed} value={filters.mood}
                  data={(options?.moods ?? []).map((v) => ({ value: v, label: moodInfo(v).label }))} onChange={(mood) => onChange({ mood })} />
              </Field>
              {social && (
                <Field label="Intensitas min.">
                  <DarkSelect leftSection={<IconFlame size={15} />} placeholder="Semua" disabled={unanalyzed} searchable={false} value={filters.minLevel || null}
                    data={LEVEL_OPTIONS} onChange={(level) => onChange({ minLevel: level ?? "" })} />
                </Field>
              )}
            </Section>

            <Section icon={IconNews} title="Sumber & konten">
              <Field label={SOURCE_KIND_LABEL[type]}>
                <DarkSelect leftSection={social ? <PlatformMark source={filters.source} /> : <IconNews size={15} />} placeholder="Semua" limit={SOURCE_DROPDOWN_LIMIT}
                  value={filters.source} data={(options?.sources ?? []).map((v) => ({ value: v, label: sourceLabel(v) }))} onChange={(source) => onChange({ source })} />
              </Field>
              <Field label="Kategori">
                <DarkSelect leftSection={<IconTag size={15} />} placeholder="Semua" value={filters.category}
                  data={(options?.categories ?? []).map((v) => ({ value: v, label: capitalize(humanize(v)) }))} onChange={(category) => onChange({ category })} />
              </Field>
              {social && (
                <Field label="Jenis post">
                  <DarkSelect leftSection={<IconMessage size={15} />} placeholder="Semua" searchable={false} value={filters.postType || null}
                    data={(options?.postTypes ?? []).map((v) => ({ value: v, label: POST_TYPE_LABEL[v] ?? v }))} onChange={(postType) => onChange({ postType: postType ?? "" })} />
                </Field>
              )}
              <Field label="Bahasa" wide={!social}>
                <DarkSelect leftSection={<IconLanguage size={15} />} placeholder="Semua" searchable={false} value={filters.language || null}
                  data={LANGUAGE_OPTIONS} onChange={(language) => onChange({ language: (language ?? "") as MediaFilters["language"] })} />
              </Field>
              {!social && (
                <Field label="Gambar" wide>
                  <Segmented full options={IMAGE_OPTIONS} value={filters.withImage ? "yes" : ""} onChange={(v) => onChange({ withImage: v === "yes" })} />
                </Field>
              )}
            </Section>

            </fieldset>
            <Section icon={IconCalendar} title="Waktu & lokasi">
              <Field label="Rentang tanggal" wide>
                <DateRange from={filters.from} to={filters.to} onChange={onChange} />
              </Field>
              <Field label="Provinsi" wide>
                <DarkSelect leftSection={<IconMapPin size={15} />} placeholder="Seluruh Indonesia" value={filters.province}
                  data={options?.provinces ?? []} onChange={(province) => onChange({ province })} />
              </Field>
            </Section>
          </div>

          <footer className={classes.panelFooter}>
            {changed > 0
              ? <button type="button" className={classes.secondary} onClick={() => setDraft(applied)}>Batalkan</button>
              : <button type="button" className={classes.secondary} onClick={resetDraft} disabled={!activeCount}>Reset ke awal</button>}
            <button type="button" className={classes.primary} onClick={submit}>
              {changed > 0 ? `Terapkan · ${changed} perubahan` : total != null ? `Lihat ${formatNumber(total)} data` : "Menghitung…"}
            </button>
          </footer>
        </div>
      </aside>
    </>
  );
}
