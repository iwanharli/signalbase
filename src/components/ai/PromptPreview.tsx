"use client";
// Tries the editor's current prompt and categories on the newest real items in the key's scope. Nothing is stored.
import { useState } from "react";
import { IconAlertTriangle, IconFlask, IconWorld, IconBrandX } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { post } from "@/lib/api-client";
import { categoriesForType, NO_CATEGORY } from "@/lib/ai/classifier";
import type { ClassifierDraft } from "./ClassifierEditor";
import { Button } from "../ui/Button";
import classes from "./preview.module.css";

type Result = { code: string; source: string; publishedAt: string; text: string; category: string | null; confidence: number | null; reason: string | null; saved: string | null };
type Type = "social" | "online";

export function PromptPreview({ apiKeyId, draft, types }: { apiKeyId: string; draft: ClassifierDraft; types: Type[] }) {
  const [type, setType] = useState<Type>(types[0] ?? "social");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ items: Result[]; ms: number; type: Type } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = categoriesForType(draft, type) as ClassifierDraft["categories"];
  const label = (code: string | null) => code === NO_CATEGORY ? "Tidak termasuk" : categories.find((c) => c.code === code)?.label ?? code ?? "—";

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const res = await post(`/api/admin/keys/${apiKeyId}/classifier/preview`, {
        provider: draft.provider, prompt: draft.prompt, categories: draft.categories, onlineCategories: draft.onlineCategories, type, size: 10,
      }) as { items: Result[]; ms: number };
      setResult({ ...res, type });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const items = result?.items ?? [];
  const tally = new Map<string, number>();
  for (const i of items) if (i.category) tally.set(i.category, (tally.get(i.category) ?? 0) + 1);
  const changed = items.filter((i) => i.saved && i.category && i.saved !== i.category).length;

  return (
    <section className={classes.card}>
      <header className={classes.head}>
        <span className={classes.icon}><IconFlask size={16} /></span>
        <div><b>Uji prompt</b><small>Coba prompt dan kategori di form ini ke 10 post terbaru dalam cakupan. Hasil tidak disimpan.</small></div>
      </header>
      <div className={classes.controls}>
        {types.length > 1 && (
          <div className={classes.types} role="tablist">
            {types.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={type === t} data-active={type === t || undefined} onClick={() => setType(t)}>
                {t === "social" ? <><IconBrandX size={13} />Media sosial</> : <><IconWorld size={13} />Media online</>}
              </button>
            ))}
          </div>
        )}
        <Button variant="primary" size="sm" icon={IconFlask} onClick={run} loading={busy}>{busy ? "Menguji…" : result ? "Uji lagi" : "Uji ke 10 post"}</Button>
      </div>

      {error && <p className={classes.error}><IconAlertTriangle size={14} />{error}</p>}

      {result && (
        <>
          <div className={classes.summary}>
            <span>{items.length} post · {(result.ms / 1000).toFixed(1)} dtk</span>
            {[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => (
              <em key={code} data-none={code === NO_CATEGORY || undefined}>{code === NO_CATEGORY ? "—" : code} <b>{n}</b></em>
            ))}
            {changed > 0 && <span className={classes.changed}>{changed} berbeda dari hasil tersimpan</span>}
          </div>
          <ol className={classes.list}>
            {items.map((i) => (
              <li key={i.code}>
                <div className={classes.meta}>{i.source} · {dayjs(i.publishedAt).locale("id").format("D MMM, HH:mm")}</div>
                <p className={classes.text}>{i.text}</p>
                <div className={classes.verdict}>
                  <span className={classes.badge} data-none={i.category === NO_CATEGORY || undefined}><b>{i.category === NO_CATEGORY ? "—" : i.category ?? "?"}</b>{label(i.category)}</span>
                  {i.confidence != null && <span className={classes.conf} data-low={i.confidence < 0.6 || undefined}>{Math.round(i.confidence * 100)}%</span>}
                  {i.saved && i.saved !== i.category && <span className={classes.was}>tersimpan: {i.saved === NO_CATEGORY ? "Tidak termasuk" : i.saved}</span>}
                </div>
                {i.reason && <p className={classes.reason}>{i.reason}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
