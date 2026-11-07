"use client";
import { useEffect } from "react";
import { IconAdjustmentsHorizontal, IconCalendar, IconFlame, IconLanguage, IconMapPin, IconMessage, IconMoodSmile, IconNews, IconRobot, IconSparkles, IconTag, IconX } from "@tabler/icons-react";
import { NO_CATEGORY, type Category } from "@/lib/ai/classifier";
import type { MediaFilters } from "@/lib/media/filters";
import { capitalize, formatNumber, humanize, MOOD_KIND_LABEL, POST_TYPE_LABEL, SOURCE_KIND_LABEL, sourceLabel } from "@/lib/media/labels";
import { moodInfo } from "@/lib/media/mood";
import type { FilterOptions, MediaType } from "@/lib/media/types";
import { DarkSelect, DateRange, Field, Segmented } from "./controls";
import { PlatformMark } from "./PlatformIcon";
import classes from "./filters.module.css";

const ANALYZED_OPTIONS = [{ value: "yes", label: "Ada label" }, { value: "no", label: "Tanpa label" }, { value: "", label: "Semua" }] as const;
const RELEVANCE_OPTIONS = [
  { value: "relevant", label: "Relevan" }, { value: "watchlist", label: "Watchlist" }, { value: "exclude", label: "Tidak relevan" }, { value: "", label: "Semua" },
] as const;
const LEVEL_OPTIONS = [2, 3, 4, 5].map((n) => ({ value: String(n), label: `≥ ${n} dari 5` }));
const LANGUAGE_OPTIONS = [{ value: "id", label: "Indonesia" }, { value: "other", label: "Bahasa lain" }];
const IMAGE_OPTIONS = [{ value: "", label: "Semua" }, { value: "yes", label: "Hanya bergambar" }] as const;
const SOURCE_DROPDOWN_LIMIT = 80;

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

/** Left drawer with every filter. Pushes the page on wide screens, overlays it on small ones. */
export function AdvancedFilters({ type, open, onClose, escapeEnabled, filters, onChange, onReset, options, aiCategories, activeCount, advancedCount, total }: {
  type: MediaType;
  open: boolean;
  onClose: () => void;
  escapeEnabled: boolean;
  filters: MediaFilters;
  onChange: (patch: Partial<MediaFilters>) => void;
  onReset: () => void;
  options: FilterOptions | null;
  activeCount: number;
  advancedCount: number;
  /** Exact total for the current filters, or null while counting. */
  total: number | null;
  /** Categories of the API key being browsed through, when it uses AI categorisation. */
  aiCategories?: Category[] | null;
}) {
  useEscape(open && escapeEnabled, onClose);
  const social = type === "social";
  const unanalyzed = filters.analyzed === "no";

  return (
    <>
      <div className={classes.scrim} data-open={open || undefined} onClick={onClose} aria-hidden />
      <aside id="advanced-filters" className={classes.drawer} data-open={open || undefined} aria-hidden={!open} inert={!open}>
        <div className={classes.panel}>
          <header className={classes.panelHeader}>
            <div className={classes.panelTitle}>
              <IconAdjustmentsHorizontal size={18} />Filter lanjutan{advancedCount > 0 && <span>{advancedCount} aktif</span>}
            </div>
            <button type="button" className={classes.close} onClick={onClose} aria-label="Tutup"><IconX size={18} /></button>
          </header>

          <div className={classes.panelBody}>
            {aiCategories && (
              <Section icon={IconRobot} title="Kategorisasi AI">
                <Field label="Kategori AI" wide>
                  <DarkSelect leftSection={<IconRobot size={15} />} placeholder="Semua kategori" value={filters.aiCategory}
                    data={[...aiCategories.map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` })), { value: NO_CATEGORY, label: "Tidak termasuk" }]}
                    onChange={(aiCategory) => onChange({ aiCategory })} />
                  {filters.aiCategory && <small className={classes.fieldNote}>Saat kategori AI dipilih, hanya rentang tanggal dan urutan yang berlaku.</small>}
                </Field>
              </Section>
            )}
            <fieldset className={classes.filterGroup} disabled={!!filters.aiCategory}>
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
                <DarkSelect disabled={!!filters.aiCategory} leftSection={<IconMapPin size={15} />} placeholder="Seluruh Indonesia" value={filters.province}
                  data={options?.provinces ?? []} onChange={(province) => onChange({ province })} />
              </Field>
            </Section>
          </div>

          <footer className={classes.panelFooter}>
            <button type="button" className={classes.secondary} onClick={onReset} disabled={!activeCount}>Reset ke awal</button>
            <button type="button" className={classes.primary} onClick={onClose}>{total != null ? `Lihat ${formatNumber(total)} data` : "Menghitung…"}</button>
          </footer>
        </div>
      </aside>
    </>
  );
}
