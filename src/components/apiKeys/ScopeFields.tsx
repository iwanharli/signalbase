"use client";
// Keyword and fixed-scope inputs for an API key, shared by the create page and the key detail page.
import { useMemo } from "react";
import { TagsInput } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconDatabase, IconMapPin, IconTag } from "@tabler/icons-react";
import type { KeyScope } from "@/lib/media/keyScope";
import { capitalize, humanize } from "@/lib/media/labels";
import type { FilterOptions, MediaType } from "@/lib/media/types";
import { useApi } from "@/lib/useApi";
import { DarkMultiSelect, Field, Segmented } from "../media/controls";
import { KeywordChips, keywordText, RestrictionChips, scopeRestrictions, useProvinceNames } from "./shared";
import classes from "./apiKeys.module.css";

const TYPE_OPTIONS = [{ value: "both", label: "Keduanya" }, { value: "social", label: "Media Sosial" }, { value: "online", label: "Media Online" }] as const;
const ANALYZED_OPTIONS = [{ value: "", label: "Semua" }, { value: "yes", label: "Hanya sudah dianalisis" }] as const;
const RELEVANCE_OPTIONS = [{ value: "", label: "Semua" }, { value: "relevant", label: "Relevan" }, { value: "include", label: "Include" }, { value: "watchlist", label: "Watchlist" }] as const;
const LANGUAGE_OPTIONS = [{ value: "", label: "Semua" }, { value: "id", label: "Indonesia" }, { value: "other", label: "Lainnya" }] as const;
const LEVEL_OPTIONS = [{ value: "0", label: "Semua" }, ...[2, 3, 4, 5].map((n) => ({ value: String(n), label: `≥ ${n}` }))];

export const keyInputClasses = { input: classes.input, label: classes.inputLabel, description: classes.inputDescription, pill: classes.pill };

/** Filter choices for both media types, so provinces and categories cover everything the key could read. */
function useScopeOptions() {
  const social = useApi<FilterOptions>("/api/admin/media/social?view=options");
  const online = useApi<FilterOptions>("/api/admin/media/online?view=options");
  return useMemo(() => {
    const categories = [...new Set([...(social.data?.categories ?? []), ...(online.data?.categories ?? [])])].sort();
    return {
      provinces: social.data?.provinces ?? online.data?.provinces ?? [],
      categories: categories.map((c) => ({ value: c, label: capitalize(humanize(c)) })),
    };
  }, [social.data, online.data]);
}

export function KeywordsInput({ scope, onChange }: { scope: KeyScope; onChange: (scope: KeyScope) => void }) {
  return (
    <TagsInput classNames={keyInputClasses} label="Kata kunci" description="Pisahkan dengan Enter atau koma. Spasi tetap menjadi bagian frasa, misalnya pelayanan publik. Kosong berarti tidak dibatasi kata kunci."
      placeholder="mis. polri, polisi" value={scope.keywords} onChange={(keywords) => onChange({ ...scope, keywords })} splitChars={[","]} clearable />
  );
}

/** `bare` renders only the fields, for use inside a panel that already has its own title. */
export function ScopeParams({ scope, onChange, bare }: { scope: KeyScope; onChange: (scope: KeyScope) => void; bare?: boolean }) {
  const options = useScopeOptions();
  const update = (patch: Partial<KeyScope>) => onChange({ ...scope, ...patch });
  const typeValue = scope.types.length === 1 ? scope.types[0] : "both";
  const socialAllowed = typeValue !== "online";

  const setType = (value: "both" | MediaType) =>
    // Relevance and intensity only exist for social posts; drop them when the key can't read those.
    update(value === "both" ? { types: [] } : value === "online" ? { types: ["online"], relevance: "", minLevel: 0 } : { types: ["social"] });

  const grid = (
      <div className={classes.paramsGrid}>
        <Field label="Jenis media" wide>
          <Segmented full options={TYPE_OPTIONS} value={typeValue} onChange={setType} />
        </Field>
        <Field label="Status analisis" wide>
          <Segmented full options={ANALYZED_OPTIONS} value={scope.analyzedOnly ? "yes" : ""} onChange={(v) => update({ analyzedOnly: v === "yes" })} />
        </Field>
        <Field label="Relevansi AI (media sosial)" wide>
          <Segmented full disabled={!socialAllowed} options={RELEVANCE_OPTIONS} value={scope.relevance} onChange={(relevance) => update({ relevance })} />
        </Field>
        <Field label="Bahasa">
          <Segmented full options={LANGUAGE_OPTIONS} value={scope.language} onChange={(language) => update({ language })} />
        </Field>
        <Field label="Intensitas emosi min.">
          <Segmented full disabled={!socialAllowed} options={LEVEL_OPTIONS} value={String(scope.minLevel)} onChange={(v) => update({ minLevel: Number(v) })} />
        </Field>
        <Field label="Provinsi" wide>
          <DarkMultiSelect leftSection={<IconMapPin size={15} />} placeholder={scope.provinces.length ? "" : "Seluruh Indonesia"}
            data={options.provinces} value={scope.provinces} onChange={(provinces) => update({ provinces })} />
        </Field>
        <Field label="Kategori" wide>
          <DarkMultiSelect leftSection={<IconTag size={15} />} placeholder={scope.categories.length ? "" : "Semua kategori"}
            data={options.categories} value={scope.categories} onChange={(categories) => update({ categories })} />
        </Field>
      </div>
  );
  if (bare) return <div className={classes.paramsBare}>{grid}</div>;
  return (
    <div className={classes.params}>
      <div className={classes.paramsHead}><IconAdjustmentsHorizontal size={15} />Parameter cakupan<small>Opsional · dikunci di server</small></div>
      {grid}
    </div>
  );
}

export function ScopePreview({ scope }: { scope: KeyScope }) {
  const provinceName = useProvinceNames();
  return (
    <div className={classes.preview}>
      <span className={classes.sectionLabel}><IconDatabase size={13} />Ringkasan cakupan</span>
      <p>{keywordText(scope.keywords)}</p>
      <KeywordChips keywords={scope.keywords} />
      <RestrictionChips restrictions={scopeRestrictions(scope, provinceName)} />
    </div>
  );
}
