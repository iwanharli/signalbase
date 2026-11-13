// Executive brief: the archive report format (version 2). A decision document for one reader (the profile's position)
// about one finished period (harian / mingguan / bulanan): numbers computed from the bank, plus an AI assessment written
// through the lens of the institution the report serves. Shared by the writer (lib/server/brief.ts) and the print page.
import { z } from "zod";
import type { ReportKind } from "./report";

export type Metric = { now: number; prev: number | null };
export type BriefProfile = { recipientTitle: string; recipientName: string; institution: string; region: string; partners: string[]; sifat: string };

export type PlatformRow = { source: string; posts: number; interactions: number; views: number | null; prevPosts: number; lastDay: string | null };
export type DayRow = { day: string; posts: number; interactions: number; news: number };
export type EmotionRow = { value: string; n: number; intense: number };
export type CategoryRow = { value: string; posts: number; interactions: number };
export type ActorRow = { username: string; source: string; kind: "media" | "institusi" | "publik"; posts: number; interactions: number; negShare: number | null };
export type IssueRow = {
  code: string; kind: "ews" | "news"; title: string; level: string | null; score: number | null;
  posts: number; accounts: number | null; interactions: number | null; emotion: string | null; maxLevel: number | null;
  location: string | null; actors: string[]; targets: string[];
  /** Day the early-warning alert was sent (EWS only); before the period start = still live from the days before. */
  sentDay: string | null;
};

/** Everything computed from the bank for one report; AI output is kept apart in `ai`. */
export type BriefData = {
  version: 2;
  kind: ReportKind; start: string; day: string; days: number; at: string;
  number: string;
  scope: { id: string; name: string; keywords: string[] };
  profile: BriefProfile;
  kpi: { posts: Metric; accounts: Metric; interactions: Metric; views: Metric; news: Metric; negShare: Metric; ews: Metric; critical: number };
  daily: DayRow[];
  platforms: PlatformRow[];
  emotions: EmotionRow[];
  labelledShare: number | null;
  categories: CategoryRow[];
  actors: ActorRow[];
  issues: IssueRow[];
  sources: Record<string, { label: string; url: string | null }>;
  /** Platforms the bank does not collect at all, for the limitations section. */
  notCollected: string[];
  ai: BriefAi | null;
  aiError: string | null;
};

// ---------------------------------------------------------------- AI assessment

const t = (max: number) => z.string().trim().min(1).transform((s) => s.slice(0, max));
const opt = (max: number) => z.string().trim().transform((s) => s.slice(0, max)).optional();
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).default([]).transform((a) => a.slice(0, max));
const pick = <T extends string>(values: readonly T[], fallback: T) =>
  z.string().transform((v): T => values.find((x) => x === v.trim().toUpperCase() || x === v.trim().toLowerCase()) ?? fallback);
const codes = z.array(z.string()).default([]).transform((a) => [...new Set(a.map((x) => x.trim().toUpperCase()).filter((x) => /^[SBEI]\d{1,3}$/.test(x)))].slice(0, 4));

export const HEAT = ["TINGGI", "WASPADA", "TERKENDALI"] as const;
export const MOMENTUM = ["NAIK", "STABIL", "MENURUN"] as const;
export const PRIORITY = ["SEGERA", "TINGGI", "SEDANG", "RENDAH"] as const;
export const CONFIDENCE = ["tinggi", "sedang", "rendah"] as const;
export const FOLLOW = ["terlihat", "sebagian", "belum terlihat", "tidak dapat dinilai"] as const;

export const briefAiSchema = z.object({
  suhu: z.object({ level: pick(HEAT, "WASPADA"), momentum: pick(MOMENTUM, "STABIL"), ringkas: t(420) }),
  keputusan: z.object({ pengantar: t(200), isu: list(z.object({ judul: t(120), tenggat: t(40) }), 5) }),
  temuan: list(z.object({ judul: t(80), isi: t(380), evidence: codes }), 4),
  catatanKpi: z.object({
    posts: opt(90), accounts: opt(90), interactions: opt(90), views: opt(90), news: opt(90), negShare: opt(90), ews: opt(90),
  }).default({}),
  tren: z.object({ judul: t(90), isi: t(420) }).optional(),
  platform: list(z.object({ tujuan: t(40), kanal: t(60), alasan: t(140) }), 5),
  isuRelevansi: list(z.object({ kode: t(6), relevansi: t(80) }), 12),
  emosi: opt(420),
  aktor: list(z.object({ akun: t(60), karakter: t(40), tindakan: t(80) }), 8),
  konten: opt(420),
  kartu: list(z.object({
    kode: t(6), judul: t(110), fakta: list(t(260), 6), implikasi: t(520), tindakan: t(260), tenggat: t(40),
    keyakinan: pick(CONFIDENCE, "sedang"), evidence: codes,
  }), 5),
  isuLain: list(z.object({ kode: t(6), inti: t(220), tindakan: t(220) }), 6),
  matriks: list(z.object({ tindakan: t(200), waktu: t(30), kode: opt(6), prioritas: pick(PRIORITY, "SEDANG") }), 10),
  mitra: list(z.object({ mitra: t(60), kebutuhan: t(240) }), 6),
  kalender: list(z.object({ tanggal: t(30), peristiwa: t(160), catatan: opt(160) }), 8),
  pemicu: list(z.object({ sinyal: t(200), kode: opt(12), eskalasi: t(60) }), 7),
  tindakLanjut: list(z.object({ tindakan: t(200), status: pick(FOLLOW, "tidak dapat dinilai"), catatan: t(240) }), 8),
  disinformasi: list(z.object({ narasi: t(220), status: t(120), evidence: codes }), 4),
  evaluasi: opt(700),
  prioritas: list(t(200), 3),
  keterbatasan: t(500),
});
export type BriefAi = z.infer<typeof briefAiSchema>;

export const isBrief = (d: unknown): d is BriefData => !!d && typeof d === "object" && (d as { version?: number }).version === 2;

const HEAT_COLOR: Record<string, string> = { TINGGI: "#e11d48", WASPADA: "#ea580c", TERKENDALI: "#16a34a" };
export const heatColor = (level: string) => HEAT_COLOR[level] ?? "#64748b";

/** Status from the numbers when there is no AI assessment: any Critical = TINGGI, any High = WASPADA. */
export function heatFromIssues(issues: IssueRow[]) {
  if (issues.some((i) => i.level === "Critical")) return "TINGGI";
  if (issues.some((i) => i.level === "High")) return "WASPADA";
  return "TERKENDALI";
}

/** Change in percent; null without a previous value. */
export const change = (m: Metric) => (m.prev && m.prev > 0 ? Math.round(((m.now - m.prev) / m.prev) * 100) : null);
