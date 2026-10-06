import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// A vault written by v0.1 (before the TypeScript migration) must keep opening, unchanged.
// The fixture is test data only; its password is below.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-fixture-"));
fs.copyFileSync(new URL("./fixtures/vault-pre-ts.kv", import.meta.url), path.join(HOME, "vault.kv"));
process.env.KV_HOME = HOME;
const store = await import("../src/store.ts");
const PW = "fixture password — not a real vault";

test("a vault from before the TypeScript migration opens with the same contents", async () => {
  const { data } = await store.unlockWithPassword(PW);
  assert.equal(store.getEntry(data, "demo-app", "API_KEY").value, "fixture-api-value");
  const items = store.listItems(data);
  assert.deepEqual(items.map((i) => [i.type, i.title, i.sub]), [
    ["login", "Example", "dana@example.com · example.com"],
    ["card", "Test card", "•••• 1111 · 12/30"],
  ]);
  const login = items.find((i) => i.type === "login")!;
  assert.equal(store.itemValue(data, login.id, "password"), "fixture-login-pw");
});

test("the fixture still rejects a wrong password", async () => {
  await assert.rejects(store.unlockWithPassword("wrong"), /Wrong master password/);
});
