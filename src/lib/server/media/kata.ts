// Indonesian word frequencies (kata.txt, from the source database's news titles and posts) for splitting words that OCR
// ran together. Read once per process.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WordFreq } from "@/lib/mediaVisual";

let cached: { words: WordFreq; total: number } | null = null;

export function wordFreq() {
  if (cached) return cached;
  const words: WordFreq = new Map();
  let total = 0;
  try {
    for (const line of readFileSync(join(process.cwd(), "src/lib/server/media/kata.txt"), "utf8").split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const [w, n] = line.split(" ");
      const f = Number(n);
      if (w && f > 0) { words.set(w, f); total += f; }
    }
  } catch { /* without the list nothing is split */ }
  cached = { words, total: Math.max(1, total) };
  return cached;
}
