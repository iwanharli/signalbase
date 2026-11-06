// Sentiment (online news) or emotion (social posts): display label and tone colour.
const SENTIMENT: Record<string, [string, string]> = { positive: ["Positif", "teal"], neutral: ["Netral", "blue"], negative: ["Negatif", "red"] };
const POSITIVE = /dukung|harap|apresia|senang|bangga|puas|percaya|terima kasih|syukur|bahagia|optimis|simpati|empati|kagum/;
const CRITICAL = /kritik|kritis|sindir|skeptis|ragu|bingung|heran|curiga/;
const NEGATIVE = /tolak|nolak|protes|kecam|ngecam|marah|kecewa|kesal|khawatir|takut|sedih|benci|jijik|muak|frustr|cemas|geram|sinis|cemooh|hina/;

export function moodInfo(v: string) {
  if (SENTIMENT[v]) return { label: SENTIMENT[v][0], color: SENTIMENT[v][1] };
  const color = POSITIVE.test(v) ? "teal" : NEGATIVE.test(v) ? "red" : CRITICAL.test(v) ? "yellow" : v === "netral" ? "blue" : "gray";
  return { label: v.charAt(0).toUpperCase() + v.slice(1), color };
}

export const TYPE_LABEL = { sosial: "Media Sosial", online: "Media Online" } as const;
