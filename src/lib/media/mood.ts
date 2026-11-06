// Display label and Mantine colour for a sentiment (online news) or an emotion (social posts).

const SENTIMENTS: Record<string, { label: string; color: string }> = {
  positive: { label: "Positif", color: "teal" },
  neutral: { label: "Netral", color: "blue" },
  negative: { label: "Negatif", color: "red" },
};

// The bank's main emotions each get their own colour so they never blend in charts.
const EMOTION_COLORS: Record<string, string> = { menolak: "orange", marah: "red", mendukung: "teal", puas: "lime", netral: "blue" };

// Fallback for less common emotions, matched by Indonesian word stems.
const POSITIVE = /dukung|harap|apresia|senang|bangga|puas|percaya|terima kasih|syukur|bahagia|optimis|simpati|empati|kagum/;
const CRITICAL = /kritik|kritis|sindir|skeptis|ragu|bingung|heran|curiga/;
const NEGATIVE = /tolak|nolak|protes|kecam|ngecam|marah|kecewa|kesal|khawatir|takut|sedih|benci|jijik|muak|frustr|cemas|geram|sinis|cemooh|hina/;

function emotionColor(value: string) {
  if (EMOTION_COLORS[value]) return EMOTION_COLORS[value];
  if (POSITIVE.test(value)) return "teal";
  if (NEGATIVE.test(value)) return "red";
  if (CRITICAL.test(value)) return "yellow";
  return "gray";
}

export function moodInfo(value: string) {
  return SENTIMENTS[value] ?? { label: value.charAt(0).toUpperCase() + value.slice(1), color: emotionColor(value) };
}

// CSS colour for a mood, for inline styles outside Mantine components.
export const moodColorVar = (value: string, shade = 5) => `var(--mantine-color-${moodInfo(value).color}-${shade})`;
