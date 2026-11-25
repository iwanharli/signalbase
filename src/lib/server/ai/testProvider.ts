// The panel's "Uji koneksi" check of an AI provider.
import { NextResponse } from "next/server";
import { QUICK_WIN_PRESET } from "@/lib/ai/classifier";
import { classifyBatch, providerErrorMessage, type ProviderConfig } from "./providers";

// Two short sample texts with an obvious answer, to check the key, model, and JSON output end to end.
const SAMPLES = [
  { id: "sample-1", text: "Bikin SIM di Satpas dimintai uang tambahan 300 ribu sama oknum petugas, katanya biar cepat." },
  { id: "sample-2", text: "Resep rendang padang yang empuk dan bumbunya meresap." },
];

/** Classifies a few sample posts with `config` and reports timing and results. */
export async function testProvider(config: ProviderConfig) {
  const started = Date.now();
  try {
    const results = await classifyBatch(config, QUICK_WIN_PRESET.prompt, QUICK_WIN_PRESET.categories, SAMPLES);
    return NextResponse.json({ ok: true, ms: Date.now() - started, results: SAMPLES.map((s) => ({ text: s.text, ...results.find((r) => r.id === s.id) })) });
  } catch (error) {
    return NextResponse.json({ ok: false, ms: Date.now() - started, error: providerErrorMessage(error) });
  }
}
