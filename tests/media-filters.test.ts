import assert from "node:assert/strict";
import { test } from "node:test";
import { browserFilterParams, defaultFilters, filtersFromSearchParams, toSearchParams } from "../src/lib/media/filters";

test("default views and overview mood links keep their intended restrictions", () => {
  for (const type of ["social", "online"] as const) {
    assert.deepEqual(filtersFromSearchParams(new URLSearchParams(), type), defaultFilters(type));
    assert.equal(filtersFromSearchParams(new URLSearchParams("mood=marah"), type).mood, "marah");
  }
});

test("a shared URL preserves unrestricted choices rather than restoring restrictive defaults", () => {
  const filters = { ...defaultFilters("social"), analyzed: "" as const, relevance: "" as const };
  const url = browserFilterParams(filters);
  assert.equal(url.get("analyzed"), "");
  assert.deepEqual(filtersFromSearchParams(url, "social"), filters);
  assert.equal(toSearchParams(filters).has("analyzed"), false);
});

test("reload preserves phrases, unicode, dates, and combined social filters", () => {
  const filters = {
    ...defaultFilters("social"), search: "pelayanan publik & polisi", from: "2026-10-01", to: "2026-11-07",
    sort: "oldest" as const, source: "twitter", mood: "marah", analyzed: "yes" as const,
    language: "id" as const, province: "32", category: "pelayanan_publik", relevance: "watchlist" as const,
    postType: "reply", minLevel: "3", aiCategory: "QW3",
  };
  assert.deepEqual(filtersFromSearchParams(new URLSearchParams(browserFilterParams(filters).toString()), "social"), filters);
});

test("malformed URL values cannot create invalid controls or cross-media filters", () => {
  const filters = filtersFromSearchParams(new URLSearchParams("sort=invalid&analyzed=maybe&lang=xx&from=2026-02-30&to=garbage&level=99&image=yes&postType=reply&relevance=watchlist"), "online");
  assert.deepEqual(filters, { ...defaultFilters("online"), withImage: true });
});

test("online image restriction survives a shared URL", () => {
  const filters = { ...defaultFilters("online"), withImage: true, source: "news-kompas", analyzed: "" as const };
  assert.deepEqual(filtersFromSearchParams(browserFilterParams(filters), "online"), filters);
});
