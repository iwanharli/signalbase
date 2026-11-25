// Settings of AI labelling ("Kustomisasi Label"), shared by the panel and the server. One set per project.
import { z } from "zod";
import { apiKeyProblem, XAI_BASE_URL } from "./classifier";

/** The providers offered, the first one preselected. Both speak the OpenAI API; the address is fixed per provider, so the
 *  browser never chooses where a key is sent. */
export const LABEL_AI_PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", vendor: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  { id: "grok", label: "Grok (xAI)", vendor: "xAI", baseUrl: XAI_BASE_URL, model: "grok-4.7" },
] as const;
export type LabelAiProviderId = (typeof LABEL_AI_PROVIDERS)[number]["id"];
export const labelAiProvider = (id: string) => LABEL_AI_PROVIDERS.find((p) => p.id === id) ?? LABEL_AI_PROVIDERS[0];

const providerFields = {
  provider: z.enum(["deepseek", "grok"]),
  model: z.string().trim().min(2, "Model wajib diisi").max(100),
  /** Empty keeps (or tests) the stored key of the same provider. */
  apiKey: z.string().trim().max(400).default(""),
};
const keyLooksRight = (v: { provider: string; apiKey: string }) => !v.apiKey || !apiKeyProblem("openai_compatible", labelAiProvider(v.provider).baseUrl, v.apiKey);
const KEY_MESSAGE = { message: "API key penyedia AI tidak terlihat seperti API key", path: ["apiKey"] };

export const labelAiTestSchema = z.object(providerFields).refine(keyLooksRight, KEY_MESSAGE);
export const labelAiSchema = z.object({
  ...providerFields,
  /** null: not edited, so the instruction keeps following the project's labels. */
  prompt: z.string().trim().min(10, "Instruksi minimal 10 karakter").max(8000, "Instruksi maksimal 8000 karakter").nullable(),
  /** Oldest publish time to label; null = everything in scope. */
  startFrom: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Tanggal mulai tidak valid").nullable(),
}).refine(keyLooksRight, KEY_MESSAGE);
export type LabelAiInput = z.infer<typeof labelAiSchema>;

/** Saved settings as the panel receives them: never the key itself. */
export type LabelAiSaved = { provider: LabelAiProviderId; model: string; apiKeyHint: string; prompt: string | null; startFrom: string | null; updatedBy: string; updatedAt: string };
export type LabelAiState = { saved: LabelAiSaved | null };
