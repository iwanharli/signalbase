// The AI writes its summaries for internal dashboards, so many end with a routing note such as
// ", sehingga masuk <dashboard> dengan kategori politik". Those notes mean nothing to readers of
// Signalbase, so every clause that names a dashboard is dropped before the summary leaves the server.
//
// The dashboard names live in HIDDEN_SUMMARY_TERMS (comma separated) so they stay out of the code;
// the word "dashboard" itself is always hidden.

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let hiddenTerms: RegExp | null = null;
function hiddenTermPattern() {
  if (!hiddenTerms) {
    const terms = ["dashboard", ...(process.env.HIDDEN_SUMMARY_TERMS ?? "").split(",")].map((t) => t.trim()).filter(Boolean);
    hiddenTerms = new RegExp(`\\b(${terms.map(escapeRegExp).join("|")})\\b`, "i");
  }
  return hiddenTerms;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const CLAUSE_SPLIT = /(?=[,;]\s)/;

function cleanSentence(sentence: string, hidden: RegExp) {
  // Keep the clauses (comma/semicolon separated) that don't mention a dashboard.
  const kept = sentence.split(CLAUSE_SPLIT).filter((clause) => !hidden.test(clause));
  let text = kept.join("").replace(/^[,;]\s*/, "").replace(/\s{2,}/g, " ").trim();
  if (!text) return "";
  // A dropped trailing clause can leave the sentence without its full stop.
  text = text.replace(/[,;]\s*$/, "");
  if (!/[.!?]$/.test(text)) text += ".";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The summary without any mention of internal dashboards; null when nothing meaningful remains. */
export function cleanSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const hidden = hiddenTermPattern();
  const text = summary.split(SENTENCE_SPLIT).map((s) => cleanSentence(s, hidden)).filter(Boolean).join(" ").trim();
  return text.length >= 12 ? text : null;
}
