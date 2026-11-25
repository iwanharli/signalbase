import assert from "node:assert/strict";
import { test } from "node:test";
import { isSecretPath } from "../src/lib/session";

test("routes that reveal a stored secret are recognised", () => {
  for (const path of ["/api/admin/keys/abc/secret", "/api/admin/keys/abc/classifier/provider-key", "/api/admin/keys/abc/classifier/provider%2Dkey"]) {
    assert.equal(isSecretPath(path), true, path);
  }
  for (const path of ["/api/admin/keys/abc", "/api/admin/keys/abc/classifier", "/api/admin/keys/abc/classifier/usage", "/api/admin/keys/abc/labels"]) {
    assert.equal(isSecretPath(path), false, path);
  }
});
