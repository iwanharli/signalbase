import assert from "node:assert/strict";
import { test } from "node:test";
import { accountKind, mediaBrands } from "../src/lib/ai/accountKind";

const brands = mediaBrands(["pikiran_rakyat", "kompas", "news-detik", "kumparan", "sindonews", "jogja_tribunnews_com", "jatim-antaranews", "en-tempo", "rri_co_id", "beritasatu"]);

test("brands come from source names without generic words or regions", () => {
  for (const b of ["pikiranrakyat", "kompas", "detik", "kumparan", "tribunnews", "antaranews", "tempo"]) assert.ok(brands.includes(b), b);
  for (const g of ["jogja", "jatim", "news", "rri"]) assert.ok(!brands.includes(g), g);
});

test("outlet and info accounts are media, institutions are institusi, people are publik", () => {
  const cases: [string, string][] = [
    ["kumparancom", "media"], ["kompascom", "media"], ["kompastv", "media"], ["detiknewsofficial", "media"], ["tempodotco", "media"],
    ["suaradotcom", "media"], ["makassar_iinfo", "media"], ["faktanewss.id", "media"], ["idx_channel", "media"], ["tarakanterciduk", "media"], ["democrazymedia", "media"], ["meta.ai", "institusi"],
    ["kemenkes_ri", "institusi"], ["humas_polri", "institusi"], ["divhumaspolri", "institusi"], ["BNI", "institusi"], ["pemkotbandung", "institusi"],
    ["agus_pratomoo", "publik"], ["leviewardana", "publik"], ["rahma7o7", "publik"], ["cucunyadoraa", "publik"], ["BobbyPatriotCat", "publik"], ["", "publik"],
  ];
  for (const [u, kind] of cases) assert.equal(accountKind(u, brands), kind, u);
});
