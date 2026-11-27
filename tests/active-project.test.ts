import { test } from "node:test";
import assert from "node:assert/strict";
import { isProjectPage, legacyProjectUrl, projectPath, projectSettingsPath, splitProjectPath } from "../src/lib/activeProject";

test("isProjectPage: data pages that exist for the whole bank and per project", () => {
  for (const p of ["/dashboard", "/media/social", "/media/online", "/issues/media-online", "/issues/media-social", "/analysis/sna", "/analysis/ontology", "/analysis/media", "/command-center"]) assert.ok(isProjectPage(p), p);
  for (const p of ["/projects", "/projects/abc", "/users", "/docs", "/ai", "/reports", "/issues", "/media", "/analysis"]) assert.ok(!isProjectPage(p), p);
});

test("splitProjectPath and projectPath are inverses; the bare project path is its Beranda", () => {
  assert.deepEqual(splitProjectPath("/projects/abc/issues/media-online"), { id: "abc", page: "/issues/media-online" });
  assert.deepEqual(splitProjectPath("/projects/abc"), { id: "abc", page: "/dashboard" });
  assert.deepEqual(splitProjectPath("/projects/new"), { id: null, page: "/projects/new" });
  assert.deepEqual(splitProjectPath("/media/social"), { id: null, page: "/media/social" });
  assert.equal(projectPath("abc", "/dashboard"), "/projects/abc");
  assert.equal(projectPath("abc", "/media/online"), "/projects/abc/media/online");
  assert.equal(projectPath(null, "/media/online"), "/media/online");
  assert.equal(projectSettingsPath("abc"), "/projects/abc/settings");
  assert.equal(projectSettingsPath("abc", "labels"), "/projects/abc/settings/labels");
});

test("legacyProjectUrl: Indonesian paths, ?key= and /project addresses move to today's paths", () => {
  const at = (u: string) => { const url = new URL(u, "http://x"); return legacyProjectUrl(url.pathname, url.searchParams); };
  // The project as ?key= or ?project=
  assert.equal(at("/media/social?key=abc&q=polri"), "/projects/abc/media/social?q=polri");
  assert.equal(at("/media/online?project=abc"), "/projects/abc/media/online");
  assert.equal(at("/dashboard?key=abc"), "/projects/abc");
  // Issues
  assert.equal(at("/isu?key=abc&topik=polisi"), "/projects/abc/issues/media-online?topik=polisi");
  assert.equal(at("/isu"), "/issues/media-online");
  assert.equal(at("/isu/sosial?days=7"), "/issues/media-social?days=7");
  assert.equal(at("/isu/ews?key=abc&issue=7"), "/projects/abc/issues/media-social?issue=7");
  assert.equal(at("/proyek/abc/isu/sosial"), "/projects/abc/issues/media-social");
  // Project settings (/project, then /proyek)
  assert.equal(at("/project"), "/projects");
  assert.equal(at("/project/new"), "/projects/new");
  assert.equal(at("/project/abc"), "/projects/abc/settings");
  assert.equal(at("/project/abc/ai"), "/projects/abc/settings/ai");
  assert.equal(at("/project/abc/labels"), "/projects/abc/settings/labels");
  assert.equal(at("/proyek"), "/projects");
  assert.equal(at("/proyek/baru"), "/projects/new");
  assert.equal(at("/proyek/abc/pengaturan/label"), "/projects/abc/settings/labels");
  // Other Indonesian paths
  assert.equal(at("/proyek/abc/analisis/ontologi?days=7"), "/projects/abc/analysis/ontology?days=7");
  assert.equal(at("/analisis/ontologi?key=abc"), "/projects/abc/analysis/ontology");
  assert.equal(at("/laporan-eksekutif"), "/reports");
  assert.equal(at("/laporan?id=9"), "/report?id=9");
  assert.equal(at("/notifikasi"), "/notifications");
  assert.equal(at("/kontak"), "/contact");
  // Current addresses stay; ?project= on a page that is not a data page is its own parameter.
  assert.equal(at("/media/social"), null);
  assert.equal(at("/projects/abc/media/social"), null);
  assert.equal(at("/report?project=all"), null);
});
