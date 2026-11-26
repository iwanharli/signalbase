import { test } from "node:test";
import assert from "node:assert/strict";
import { isProjectPage } from "../src/lib/activeProject";

test("isProjectPage: halaman data proyek mengikuti proyek aktif", () => {
  for (const p of ["/dashboard", "/media/social", "/media/online", "/isu", "/isu/ews", "/analisis/sna", "/analisis/media", "/command-center"]) assert.ok(isProjectPage(p), p);
  for (const p of ["/project", "/project/abc", "/users", "/docs", "/ai", "/laporan-eksekutif", "/isuxyz", "/media", "/analisis"]) assert.ok(!isProjectPage(p), p);
});
