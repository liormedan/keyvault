import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Temporary vault — never the real one
process.env.KV_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-test-"));
const store = await import("../src/store.js");

test("create, save and reopen with the right password", async () => {
  const { key, data } = await store.create("correct horse battery");
  store.setEntry(data, "demo", "SMTP_PASS", "s3cret-value", "Gmail");
  await store.save(key, data);
  const raw = fs.readFileSync(store.VAULT, "utf8");
  assert.ok(!raw.includes("s3cret-value"), "the value is not in the file in plain text");
  assert.ok(!raw.includes("SMTP_PASS"), "the key name is encrypted too");
  const opened = await store.unlockWithPassword("correct horse battery");
  assert.equal(store.getEntry(opened.data, "demo", "SMTP_PASS").value, "s3cret-value");
});

test("wrong password fails", async () => {
  await assert.rejects(store.unlockWithPassword("wrong password!!"), /Wrong master password/);
});

test("tampering with the file (header included) fails decryption", async () => {
  const file = JSON.parse(fs.readFileSync(store.VAULT, "utf8"));
  const orig = JSON.stringify(file);
  file.kdf.ops += 1;
  fs.writeFileSync(store.VAULT, JSON.stringify(file));
  await assert.rejects(store.unlockWithPassword("correct horse battery"));
  fs.writeFileSync(store.VAULT, orig);
  file.ct = file.ct.slice(0, -4) + (file.ct.endsWith("AAA=") ? "BBB=" : "AAA=");
  fs.writeFileSync(store.VAULT, JSON.stringify({ ...JSON.parse(orig), ct: file.ct }));
  await assert.rejects(store.unlockWithPassword("correct horse battery"));
  fs.writeFileSync(store.VAULT, orig);
});

test("listing without values, delete, ref parsing", async () => {
  const { key, data } = await store.unlockWithPassword("correct horse battery");
  const list = store.listing(data);
  assert.deepEqual(Object.keys(list.demo[0]).sort(), ["key", "note", "updated"]);
  store.deleteEntry(data, "demo", "SMTP_PASS");
  await store.save(key, data);
  assert.deepEqual((await store.unlockWithPassword("correct horse battery")).data.projects, {});
  assert.deepEqual(store.parseRef("trimios/API_KEY"), ["trimios", "API_KEY"]);
  assert.throws(() => store.parseRef("nokey"));
});
