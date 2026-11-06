import type { Item, Prisma } from "@prisma/client";
import type { MediaType } from "./bank";

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Filters for reviewed items stored here (same names as the bankkomen filters).
export function itemWhere(type: MediaType, status: string, s: URLSearchParams): Prisma.ItemWhereInput {
  const where: Prisma.ItemWhereInput = { type, status };
  const q = s.get("q")?.trim();
  if (q) where.OR = [{ content: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }];
  const from = s.get("from"), to = s.get("to");
  if (isDate(from) || isDate(to)) where.publishedAt = {
    ...(isDate(from) ? { gte: new Date(`${from}T00:00:00+07:00`) } : {}),
    ...(isDate(to) ? { lt: new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000) } : {}),
  };
  const source = s.get("source");
  if (source) where.source = source;
  const mood = s.get("mood");
  if (mood) where.mood = mood.toLowerCase();
  return where;
}

// Shape shared by the panel and the public API. No internal ids or reviewer names.
export const publicItem = (i: Item) => ({
  id: i.id, type: i.type, source: i.source, title: i.title, content: i.content, url: i.url, image: i.image,
  postType: i.postType, category: i.category, province: i.province, location: i.location,
  publishedAt: i.publishedAt, mood: i.mood, moodLevel: i.moodLevel, metrics: i.metrics,
});
