import assert from "node:assert/strict";
import { test } from "node:test";
import { isSecretPath } from "../src/lib/session";

test("routes that reveal a stored secret are recognised", () => {
  for (const path of ["/api/admin/projects/abc/secret", "/api/admin/projects/abc/classifier/provider-key", "/api/admin/projects/abc/classifier/provider%2Dkey"]) {
    assert.equal(isSecretPath(path), true, path);
  }
  for (const path of ["/api/admin/projects/abc", "/api/admin/projects/abc/classifier", "/api/admin/projects/abc/classifier/usage", "/api/admin/projects/abc/labels"]) {
    assert.equal(isSecretPath(path), false, path);
  }
});
