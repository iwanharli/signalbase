// Shared by the Isu page and its API: periods, row types and the keyword filter on issue titles.

export const ISSUE_PERIODS = [{ days: 3, label: "3 hari" }, { days: 7, label: "7 hari" }, { days: 14, label: "14 hari" }, { days: 30, label: "1 bulan" }] as const;
export type IssueDays = (typeof ISSUE_PERIODS)[number]["days"];
export const DEFAULT_ISSUE_DAYS: IssueDays = 7;
export const ISSUES_LIMIT = 200;
export const ISSUE_NEWS_PAGE = 20;

/** The period from ?days=; null when it is not one of the allowed choices (the value goes into SQL as a number). */
export function parseIssueDays(raw: string | null): IssueDays | null {
  if (raw === null) return DEFAULT_ISSUE_DAYS;
  const found = ISSUE_PERIODS.find((p) => String(p.days) === raw);
  return found ? found.days : null;
}

export type IssueSummary = {
  id: string; title: string;
  /** A cleaner headline the pipeline generates; often missing. */
  label: string | null;
  newsCount: number; firstSeenAt: string; lastSeenAt: string; score: number;
  /** Still receiving news (status "active"). */
  active: boolean;
};

export type IssueNews = {
  code: string; source: string; url: string | null; author: string | null; title: string; preview: string | null;
  publishedAt: string; image: string | null; category: string | null; province: string | null;
};
export type IssueSource = { source: string; count: number };

/** Escapes % _ \ so a keyword is matched literally inside ILIKE, then wraps it as a "contains" pattern. */
export const likePatterns = (keywords: string[]) => keywords.map((k) => `%${k.replace(/[\\%_]/g, "\\$&")}%`);

/** Issues whose title contains any of these are skipped (horoscopes, ads, daily gold price). Plain "contains", so keep the words specific. */
export const SPAM_TERMS = ["zodiak", "zodiac", "iklan", "harga emas", "emas antam"];

/** The submenu of /isu. A topic with `terms` only keeps issues whose title contains one of them (hardcoded for now). */
export const ISSUE_TOPICS = [
  { id: "nasional", label: "Isu Nasional", terms: [] as string[] },
  { id: "polisi", label: "Isu Polisi", terms: ["polisi", "polri", "polda"] },
] as const;
export type IssueTopic = (typeof ISSUE_TOPICS)[number]["id"];
export const DEFAULT_ISSUE_TOPIC: IssueTopic = "nasional";

/** The topic from ?topik=; null when it is not one of the allowed choices. */
export function parseIssueTopic(raw: string | null): IssueTopic | null {
  if (raw === null) return DEFAULT_ISSUE_TOPIC;
  return ISSUE_TOPICS.find((t) => t.id === raw)?.id ?? null;
}
export const topicTerms = (topic: IssueTopic): readonly string[] => ISSUE_TOPICS.find((t) => t.id === topic)!.terms;

/**
 * WHERE fragment: title mentions any project keyword (none = all) AND any topic term (none = all) AND contains no
 * SPAM_TERMS word. Params are numbered from `first`, in that order.
 */
export function titleFilter(keywords: string[], first: number, topic: readonly string[] = [], column = "ni.title") {
  const params = [...likePatterns(keywords), ...likePatterns([...topic]), ...likePatterns(SPAM_TERMS)];
  const any = (from: number, count: number) => `(${Array.from({ length: count }, (_, i) => `${column} ILIKE $${first + from + i}`).join(" OR ")})`;
  const skipFrom = keywords.length + topic.length;
  const parts = [
    keywords.length ? any(0, keywords.length) : "TRUE",
    ...(topic.length ? [any(keywords.length, topic.length)] : []),
    ...SPAM_TERMS.map((_, i) => `${column} NOT ILIKE $${first + skipFrom + i}`),
  ];
  return { sql: parts.join(" AND "), params };
}
