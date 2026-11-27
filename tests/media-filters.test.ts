import assert from "node:assert/strict";
import { test } from "node:test";
import { browserFilterParams, countAdvanced, defaultFilters, filtersFromSearchParams, toSearchParams, presetRange, DATE_PRESETS, savedFilterParams, savedFilterValue, splitFilterUrl } from "../src/lib/media/filters";
import { applyRules } from "../src/components/media/useMediaFilters";

test("default views and overview mood links keep their intended restrictions", () => {
  for (const type of ["social", "online"] as const) {
    assert.deepEqual(filtersFromSearchParams(new URLSearchParams(), type), defaultFilters(type));
    assert.equal(filtersFromSearchParams(new URLSearchParams("mood=marah"), type).mood, "marah");
  }
});

test("a shared URL preserves unrestricted choices rather than restoring restrictive defaults", () => {
  const filters = { ...defaultFilters("social"), analyzed: "" as const, relevance: "" as const };
  const url = browserFilterParams(filters, "social");
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
  assert.deepEqual(filtersFromSearchParams(new URLSearchParams(browserFilterParams(filters, "social").toString()), "social"), filters);
});

test("malformed URL values cannot create invalid controls or cross-media filters", () => {
  const filters = filtersFromSearchParams(new URLSearchParams("sort=invalid&analyzed=maybe&lang=xx&from=2026-02-30&to=garbage&level=99&image=yes&postType=reply&relevance=watchlist"), "online");
  assert.deepEqual(filters, { ...defaultFilters("online"), withImage: true });
});

test("online image restriction survives a shared URL", () => {
  const filters = { ...defaultFilters("online"), withImage: true, source: "news-kompas", analyzed: "" as const };
  assert.deepEqual(filtersFromSearchParams(browserFilterParams(filters, "online"), "online"), filters);
});

test("the viewed project goes to the API but not into the browser URL, and is not counted as a filter", () => {
  const filters = { ...defaultFilters("social"), project: "k1" };
  assert.deepEqual(filtersFromSearchParams(browserFilterParams(filters, "social"), "social"), { ...filters, project: null });
  assert.equal(toSearchParams(filters).get("project"), "k1");
  assert.equal(countAdvanced(filters, "social"), 0);
});

test("switching project drops its label and AI category; an applied draft keeps what it names", () => {
  const current = { ...defaultFilters("social"), project: "k1", manualLabel: "Hoaks", aiCategory: "QW3" };
  const switched = applyRules({ ...current, project: "k2" }, { project: "k2" });
  assert.deepEqual([switched.project, switched.manualLabel, switched.aiCategory], ["k2", null, null]);
  assert.equal(applyRules(current, current).manualLabel, "Hoaks");
});

test("default filters stay out of the browser URL, and every non-default choice survives a reload", () => {
  for (const type of ["social", "online"] as const) {
    assert.equal(browserFilterParams(defaultFilters(type), type).toString(), "");
    assert.equal(browserFilterParams({ ...defaultFilters(type), project: "k1" }, type).toString(), "", "the project is in the path");
    assert.equal(toSearchParams({ ...defaultFilters(type), project: "k1" }).get("project"), "k1", "API requests name it");
  }
  assert.equal(browserFilterParams({ ...defaultFilters("social"), analyzed: "", relevance: "" }, "social").toString(), "analyzed=&relevance=");
  for (const patch of [{ sort: "oldest" }, { analyzed: "no" }, { analyzed: "" }, { relevance: "exclude" }, { relevance: "" }] as const) {
    const filters = { ...defaultFilters("social"), ...patch };
    assert.deepEqual(filtersFromSearchParams(browserFilterParams(filters, "social"), "social"), filters);
  }
});

test("saved filters: defaults save nothing, the project is not part of them, and choices restore", () => {
  assert.equal(savedFilterValue({ ...defaultFilters("social"), project: "k1" }, "social"), "");
  const filters = { ...defaultFilters("social"), project: "k1", search: "polisi", sort: "oldest" as const, relevance: "" as const, from: "2026-01-02", to: "2026-01-09" };
  const restored = filtersFromSearchParams(savedFilterParams(savedFilterValue(filters, "social"), "social"), "social");
  assert.deepEqual(restored, { ...filters, project: null });
});

test("saved filters: a quick range is saved as its length and restored relative to today", () => {
  const month = DATE_PRESETS.find((p) => p.days === 29)!;
  const value = savedFilterValue({ ...defaultFilters("online"), ...presetRange(month) }, "online");
  assert.equal(value, "days=29");
  assert.equal(savedFilterParams(value, "online").get("from"), presetRange(month).from);
  assert.deepEqual(DATE_PRESETS.map((p) => p.days), [0, 6, 29, null]);
  // The former “2 hari” saved in a browser restores as “1 hari”.
  assert.equal(savedFilterParams("days=1", "online").get("from"), presetRange(DATE_PRESETS[0]).from);
});

test("an incoming link: filters are taken off the URL and remembered, the project stays", () => {
  const link = splitFilterUrl(new URLSearchParams("key=k1&lang=id&category=pemerintahan"), "social");
  assert.equal(link.rest.toString(), "key=k1");
  assert.equal(link.saved, "lang=id&category=pemerintahan");
  assert.equal(splitFilterUrl(new URLSearchParams("key=k1"), "social").saved, null);
  assert.equal(splitFilterUrl(new URLSearchParams("analyzed=yes"), "social").saved, "");
});

test("default range is the last 7 days; Semua is an explicit empty from and survives a reload and a save", () => {
  const d = defaultFilters("social");
  assert.equal(d.from, presetRange(DATE_PRESETS.find((p) => p.days === 6)!).from);
  assert.equal(filtersFromSearchParams(new URLSearchParams(""), "social").from, d.from);
  const all = { ...d, ...presetRange(DATE_PRESETS.find((p) => p.days === null)!) };
  assert.equal(browserFilterParams(all, "social").toString(), "from=");
  assert.equal(filtersFromSearchParams(browserFilterParams(all, "social"), "social").from, "");
  assert.equal(filtersFromSearchParams(savedFilterParams(savedFilterValue(all, "social"), "social"), "social").from, "");
  assert.equal(savedFilterValue(d, "social"), "");
});
