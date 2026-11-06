// Shared media types, safe to import from both server and client code.

// URL segment and API value for each media kind. "sosial" is kept as-is because it is part of
// the public API contract (/api/v1/media/sosial) used by other applications.
export const MEDIA_TYPES = ["sosial", "online"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
export const isMediaType = (value: string): value is MediaType => (MEDIA_TYPES as readonly string[]).includes(value);

export type Relevance = "include" | "watchlist" | "exclude";

export type Metrics = { likes: number | null; comments: number | null; shares: number | null; views: number | null };

// AI analysis details. Social posts carry most fields; news articles only have topics.
export type Analysis = {
  summary: string | null;
  target: string | null;
  score: number | null;
  signals: string[];
  topics: string[];
  factors: Record<string, number> | null;
  dashboards: string[];
  relevance: Relevance | null;
};

// One post or article as the panel and the public API return it. No author or account details.
export type MediaItem = {
  code: string;
  source: string;
  title: string | null;
  content: string | null;
  url: string | null;
  image: string | null;
  postType: string | null;
  category: string | null;
  province: string | null;
  location: string | null;
  publishedAt: string;
  mood: string | null;
  moodLevel: number | null;
  metrics: Metrics;
  analysis: Analysis | null;
};

export type MoodCount = { value: string; n: number };
export type DailyCount = { day: string; n: number };

export type FilterOptions = {
  sources: string[];
  moods: string[];
  categories: string[];
  provinces: { value: string; label: string }[];
  postTypes: string[];
};
