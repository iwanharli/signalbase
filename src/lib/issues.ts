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

/** WHERE fragment: title mentions any keyword (none = all) AND contains no SPAM_TERMS word; params are numbered from `first`. */
export function titleFilter(keywords: string[], first: number, column = "ni.title") {
  const params = [...likePatterns(keywords), ...likePatterns(SPAM_TERMS)];
  const include = keywords.length ? `(${keywords.map((_, i) => `${column} ILIKE $${first + i}`).join(" OR ")})` : "TRUE";
  const skip = SPAM_TERMS.map((_, i) => `${column} NOT ILIKE $${first + keywords.length + i}`);
  return { sql: [include, ...skip].join(" AND "), params };
}
