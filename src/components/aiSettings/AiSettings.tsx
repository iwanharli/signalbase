"use client";
// Pengaturan AI (admins): the platform AI provider behind Ringkasan AI, its daily schedule, token prices and a monthly
// cap, plus the cost history of every call.
import { useEffect, useState } from "react";
import { NumberInput, PasswordInput, Skeleton, Switch, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconChevronRight, IconCoin, IconPlugConnected, IconSparkles, IconWallet } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/id";
import { apiKeyProblem } from "@/lib/ai/classifier";
import { AI_SUMMARY_PROVIDERS, type AiSettingInput, type AiSettingView, type UsageResponse } from "@/lib/ai/summary";
import { api, post } from "@/lib/api-client";
import { formatNumber } from "@/lib/media/labels";
import { useApi } from "@/lib/useApi";
import { Button, StatusPill } from "../ui/Button";
import c from "./aiSettings.module.css";

type SettingsResponse = { setting: AiSettingView | null; defaults: Omit<AiSettingView, "updatedAt" | "updatedBy"> };
type TestResult = { ok: boolean; ms?: number; message?: string; cost?: number; currency?: string; error?: string };

/** Money with enough decimals to show a single call's cost. */
export const money = (n: number, currency: string) => `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: n > 0 && n < 0.01 ? 4 : 2, maximumFractionDigits: n > 0 && n < 0.01 ? 5 : 2 })}`;
const PURPOSE_LABEL: Record<string, string> = { summary: "Ringkasan", report: "Laporan", test: "Uji koneksi" };

function toForm(v: Omit<AiSettingView, "updatedAt" | "updatedBy">): AiSettingInput {
  return { ...v, provider: { kind: v.provider.kind, baseUrl: v.provider.baseUrl, model: v.provider.model, apiKey: "" } };
}

export function AiSettings() {
  const settings = useApi<SettingsResponse>("/api/admin/ai-settings");
  const [page, setPage] = useState(0);
  const usage = useApi<UsageResponse>(`/api/admin/ai-settings/usage?page=${page}`);
  const [form, setForm] = useState<AiSettingInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  useEffect(() => {
    if (settings.data && !form) setForm(toForm(settings.data.setting ?? settings.data.defaults));
  }, [settings.data, form]);

  const stored = settings.data?.setting ?? null;
  const set = <K extends keyof AiSettingInput>(k: K, v: AiSettingInput[K]) => setForm((f) => f && { ...f, [k]: v });
  const setProvider = (p: Partial<AiSettingInput["provider"]>) => setForm((f) => f && { ...f, provider: { ...f.provider, ...p } });
  const keyProblem = form?.provider.apiKey ? apiKeyProblem(form.provider.kind, form.provider.baseUrl, form.provider.apiKey) : null;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api("/api/admin/ai-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      notifications.show({ color: "teal", message: "Pengaturan AI disimpan." });
      setForm((f) => f && { ...f, provider: { ...f.provider, apiKey: "" } });
      await settings.reload();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally { setSaving(false); }
  };

  const runTest = async () => {
    if (!form) return;
    setTesting(true); setTest(null);
    try {
      setTest(await post("/api/admin/ai-settings/test", form) as TestResult);
      await usage.reload();
    } catch (e) {
      setTest({ ok: false, error: (e as Error).message });
    } finally { setTesting(false); }
  };

  const u = usage.data;
  const cur = u?.currency ?? form?.currency ?? "USD";
  const budgetShare = u?.month.budget ? Math.min(1, u.month.cost / u.month.budget) : null;

  return (
    <div className={c.page}>
      <header className={c.hero}>
        <div className={c.heroGrid} aria-hidden />
        <div className={c.heroText}>
          <span className={c.badge}><IconSparkles size={13} />Platform AI</span>
          <h1>Pengaturan <em>AI</em></h1>
          <p>Penyedia AI yang menulis Ringkasan AI setiap hari untuk seluruh bank data dan tiap proyek. Setiap panggilan dicatat beserta token dan perkiraan biayanya.</p>
        </div>
        <div className={c.stats}>
          <div><b>{u ? money(u.month.cost, cur) : "—"}</b><span>Biaya bulan ini</span></div>
          <div><b>{u ? formatNumber(u.month.calls) : "—"}</b><span>Panggilan bulan ini</span></div>
          <div><b>{u?.balance?.length ? money(u.balance[0].total, u.balance[0].currency) : "—"}</b><span>Saldo penyedia</span></div>
        </div>
      </header>

      <div className={c.grid}>
        <section className={c.card}>
          <header className={c.cardHead}>
            <div><h3>Penyedia & jadwal</h3><p>{stored ? <>Disimpan {dayjs(stored.updatedAt).locale("id").format("D MMM YYYY HH.mm")}{stored.updatedBy ? ` oleh ${stored.updatedBy}` : ""}</> : "Belum diatur"}</p></div>
            {stored ? <StatusPill tone={stored.summaryEnabled ? "success" : "neutral"}>{stored.summaryEnabled ? "Aktif" : "Mati"}</StatusPill> : <StatusPill tone="warning">Belum diatur</StatusPill>}
          </header>

          {!form ? <Skeleton h={420} radius="lg" /> : <>
            <div className={c.presets} role="group" aria-label="Pilih penyedia">
              {AI_SUMMARY_PROVIDERS.map((p) => {
                const active = form.provider.kind === p.kind && (p.kind === "anthropic" || form.provider.baseUrl.replace(/\/+$/, "") === p.baseUrl || (p.id === "custom" && !AI_SUMMARY_PROVIDERS.some((q) => q.baseUrl && q.baseUrl === form.provider.baseUrl.replace(/\/+$/, ""))));
                return (
                  <button key={p.id} type="button" data-active={active || undefined}
                    onClick={() => setProvider({ kind: p.kind, baseUrl: p.baseUrl, model: p.model || form.provider.model })}>{p.label}</button>
                );
              })}
            </div>

            <div className={c.fields}>
              {form.provider.kind === "openai_compatible" && (
                <TextInput label="Base URL" value={form.provider.baseUrl} onChange={(e) => setProvider({ baseUrl: e.currentTarget.value })} placeholder="https://api.deepseek.com" />
              )}
              <TextInput label="Model" value={form.provider.model} onChange={(e) => setProvider({ model: e.currentTarget.value })}
                description={form.provider.baseUrl.includes("deepseek") ? "deepseek-flash (hemat) atau deepseek-v4-pro (lebih tajam, ±4× harga)" : undefined} />
              <PasswordInput label="API key" value={form.provider.apiKey} onChange={(e) => setProvider({ apiKey: e.currentTarget.value })} autoComplete="new-password"
                placeholder={stored?.provider.apiKeyHint ? `Tersimpan ••••${stored.provider.apiKeyHint} — kosongkan untuk tetap memakai` : "sk-…"}
                error={keyProblem} description="Disimpan terenkripsi di database dan tidak pernah dikirim ke browser." />
            </div>

            <div className={c.divider} />

            <div className={c.switches}>
              <Switch checked={form.summaryEnabled} onChange={(e) => set("summaryEnabled", e.currentTarget.checked)}
                label="Tulis Ringkasan AI setiap hari" description="Dijalankan oleh worker kategorisasi (npm run classifier)." />
              <Switch checked={form.includeProjects} onChange={(e) => set("includeProjects", e.currentTarget.checked)}
                label="Juga untuk setiap proyek aktif" description="Mati: hanya ringkasan seluruh bank data." />
            </div>
            <div className={c.fields} data-cols="2">
              <NumberInput label="Jam penulisan (WIB)" min={0} max={23} clampBehavior="strict" value={form.summaryHour} onChange={(v) => set("summaryHour", Number(v) || 0)}
                suffix=".00" description="Ringkasan data kemarin (satu hari penuh) ditulis mulai jam ini." />
              <NumberInput label={`Batas biaya bulanan (${form.currency})`} min={0} decimalScale={2} value={form.monthlyBudget ?? ""} placeholder="Tanpa batas"
                onChange={(v) => set("monthlyBudget", v === "" ? null : Number(v))} description="Penulisan berhenti sampai bulan depan bila tercapai." />
            </div>

            <div className={c.divider} />

            <p className={c.sectionLabel}><IconCoin size={14} />Harga per 1 juta token, untuk perkiraan biaya</p>
            <div className={c.fields} data-cols="4">
              <NumberInput label="Input" min={0} decimalScale={4} value={form.priceInput} onChange={(v) => set("priceInput", Number(v) || 0)} />
              <NumberInput label="Input (cache)" min={0} decimalScale={4} value={form.priceCachedInput} onChange={(v) => set("priceCachedInput", Number(v) || 0)} />
              <NumberInput label="Output" min={0} decimalScale={4} value={form.priceOutput} onChange={(v) => set("priceOutput", Number(v) || 0)} />
              <TextInput label="Mata uang" maxLength={3} value={form.currency} onChange={(e) => set("currency", e.currentTarget.value.toUpperCase())} />
            </div>
            <p className={c.hint}>Default mengikuti tarif jam sibuk deepseek-flash. Di luar jam sibuk DeepSeek memberi tarif setengahnya, jadi biaya sebenarnya bisa lebih rendah. Saldo di atas adalah angka asli dari penyedia.</p>

            {test && (
              <p className={c.test} data-ok={test.ok || undefined}>
                {test.ok ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
                {test.ok ? <>Terhubung dalam {((test.ms ?? 0) / 1000).toFixed(1)} dtk · biaya {money(test.cost ?? 0, test.currency ?? cur)}{test.message ? ` · “${test.message}”` : ""}</> : test.error}
              </p>
            )}

            <div className={c.actions}>
              <Button variant="secondary" icon={IconPlugConnected} onClick={runTest} loading={testing} disabled={!!keyProblem}>Uji koneksi</Button>
              <Button variant="primary" icon={IconCheck} onClick={save} loading={saving} disabled={!!keyProblem}>Simpan pengaturan</Button>
            </div>
          </>}
        </section>

        <section className={c.card}>
          <header className={c.cardHead}>
            <div><h3>Biaya harian</h3><p>30 hari terakhir, perkiraan dari token</p></div>
            <IconWallet size={18} className={c.headIcon} />
          </header>
          {!u ? <Skeleton h={220} radius="lg" /> : <>
            <CostChart daily={u.daily} currency={cur} />
            <dl className={c.totals}>
              <div><dt>Bulan ini</dt><dd>{money(u.month.cost, cur)}</dd></div>
              <div><dt>Token bulan ini</dt><dd>{formatNumber(u.month.tokens)}</dd></div>
              <div><dt>30 hari</dt><dd>{money(u.daily.reduce((t, d) => t + d.cost, 0), cur)}</dd></div>
            </dl>
            {budgetShare !== null && (
              <div className={c.budget} data-warn={budgetShare >= 0.8 || undefined}>
                <div><span>Batas bulanan</span><b>{money(u.month.cost, cur)} dari {money(u.month.budget!, cur)}</b></div>
                <i><span style={{ width: `${budgetShare * 100}%` }} /></i>
              </div>
            )}
          </>}
        </section>
      </div>

      <section className={c.card}>
        <header className={c.cardHead}>
          <div><h3>Riwayat pemakaian</h3><p>Setiap panggilan ke penyedia AI, termasuk yang gagal</p></div>
          {u && u.total > u.rows.length && (
            <div className={c.pager}>
              <span>{page * 25 + 1}–{page * 25 + u.rows.length} dari {formatNumber(u.total)}</span>
              <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label="Halaman sebelumnya"><IconChevronLeft size={16} /></button>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * 25 >= u.total} aria-label="Halaman berikutnya"><IconChevronRight size={16} /></button>
            </div>
          )}
        </header>
        {!u ? <Skeleton h={200} radius="lg" /> : !u.rows.length ? <p className={c.empty}>Belum ada pemakaian.</p> : (
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead><tr><th>Waktu</th><th>Jenis</th><th>Cakupan</th><th>Model</th><th className={c.num}>Input</th><th className={c.num}>Output</th><th className={c.num}>Biaya</th><th className={c.num}>Durasi</th><th>Status</th></tr></thead>
              <tbody>
                {u.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{dayjs(r.at).locale("id").format("D MMM HH.mm")}</td>
                    <td>{PURPOSE_LABEL[r.purpose] ?? r.purpose}</td>
                    <td className={c.scope}>{r.scopeName ?? "—"}</td>
                    <td><code>{r.model}</code></td>
                    <td className={c.num} title={r.cachedTokens ? `${formatNumber(r.cachedTokens)} dari cache` : undefined}>{formatNumber(r.inputTokens)}</td>
                    <td className={c.num}>{formatNumber(r.outputTokens)}</td>
                    <td className={c.num}><b>{money(r.cost, r.currency)}</b></td>
                    <td className={c.num}>{(r.ms / 1000).toFixed(1)} dtk</td>
                    <td>{r.ok ? <StatusPill tone="success">Berhasil</StatusPill> : <span title={r.error ?? undefined}><StatusPill tone="danger">Gagal</StatusPill></span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Cost per day as thin bars, one hue; hover shows the day, cost and calls. */
function CostChart({ daily, currency }: { daily: UsageResponse["daily"]; currency: string }) {
  const max = Math.max(...daily.map((d) => d.cost), 0);
  if (!max) return <p className={c.empty}>Belum ada biaya dalam 30 hari terakhir.</p>;
  return (
    <div className={c.chart} role="img" aria-label={`Biaya harian 30 hari terakhir, tertinggi ${money(max, currency)}`}>
      <span className={c.axisMax}>{money(max, currency)}</span>
      <div className={c.bars}>
        {daily.map((d, i) => (
          <div key={d.day} className={c.bar} data-today={i === daily.length - 1 || undefined}>
            <i style={{ height: `${d.cost ? Math.max(3, (d.cost / max) * 100) : 0}%` }} />
            <span className={c.tip}><b>{money(d.cost, currency)}</b>{dayjs(d.day).locale("id").format("D MMM")} · {d.calls} panggilan</span>
          </div>
        ))}
      </div>
      <div className={c.axis}><span>{dayjs(daily[0].day).locale("id").format("D MMM")}</span><span>Hari ini</span></div>
    </div>
  );
}
