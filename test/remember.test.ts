import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// "Remember me" through the system keychain (macOS Keychain / Linux Secret Service) with a throwaway
// salt in a temporary KV_HOME. Runs where KV_TEST_KEYCHAIN=1 (macOS CI); never on a developer's keychain.
const enabled = process.platform !== "win32" && process.env.KV_TEST_KEYCHAIN === "1";
process.env.KV_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-keychain-"));
const remember = await import("../src/remember.ts");

test("keychain: remember, recall, forget", { skip: !enabled && "set KV_TEST_KEYCHAIN=1 (macOS CI only)" }, async () => {
  const salt = randomBytes(16).toString("base64");
  const key = new Uint8Array(randomBytes(32));
  await remember.remember(key, salt);
  assert.equal(remember.remembered(), true);
  assert.deepEqual(await remember.recall(salt), key);
  assert.equal(await remember.recall("another-vault"), null, "a different vault does not get the key");
  await remember.forget();
  assert.equal(remember.remembered(), false);
  assert.equal(await remember.recall(salt), null);
});

test("without a keychain, remember fails with a clear message instead of crashing", { skip: process.platform === "win32" || enabled }, async () => {
  // Linux CI has no Secret Service: either it works, or it says what to install
  try {
    await remember.remember(new Uint8Array(32), "no-keychain-salt");
    await remember.forget();
  } catch (e) {
    assert.match((e as Error).message, /Secret Service|keychain/i);
  }
});
