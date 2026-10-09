import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startBackend } from "./helpers.ts";

// The desktop backend's sync and sharing methods, against a temporary vault and a temporary "cloud" folder
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-backend-sync-"));
const CLOUD = fs.mkdtempSync(path.join(os.tmpdir(), "kv-backend-cloud-"));
const PW = "backend sync password";

test("app backend: link a folder, sync on save, share to a key and receive it", async () => {
  const b = startBackend(HOME);
  await b.call("init", { password: PW });
  const st0 = (await b.call("syncStatus")).result;
  assert.equal(st0.folder, null);
  assert.equal((await b.call("syncNow")).error?.includes("off"), true);

  const login = (await b.call("itemSave", { type: "login", title: "Router", fields: { url: "http://192.168.1.1", password: "router-secret-1" } })).result;
  assert.deepEqual((await b.call("syncLink", { folder: CLOUD })).result, { mode: "created" });
  const synced = path.join(CLOUD, "kv-vault.kv");
  assert.ok(fs.existsSync(synced));
  const st = (await b.call("syncStatus")).result;
  assert.equal(st.folder, CLOUD);
  assert.ok(st.lastSync);
  assert.ok(st.revision > 0);

  // A save syncs on its own: the folder's copy changes
  const before = fs.readFileSync(synced, "utf8");
  await b.call("itemSave", { type: "note", title: "After linking", fields: { body: "x" } });
  assert.notEqual(fs.readFileSync(synced, "utf8"), before);
  assert.ok(!fs.readFileSync(synced, "utf8").includes("router-secret-1"));

  // Share to this vault's own key, then receive: previewed by name, the copy is a duplicate
  const { key } = (await b.call("shareKey")).result;
  assert.match(key, /^kvpk1\./);
  const file = path.join(HOME, "router.kvshare");
  assert.match((await b.call("shareItem", { id: login.id, to: "kvpk1.nope", path: file })).error, /isn't a kv-vault sharing key/);
  assert.equal((await b.call("shareItem", { id: login.id, to: key, path: file })).result.ok, true);
  assert.match((await b.call("shareItem", { id: login.id, to: key, path: file })).error, /already exists/);
  const preview = (await b.call("receiveOpen", { path: file })).result;
  assert.deepEqual(preview.items, [{ type: "login", title: "Router" }]);
  assert.ok(!JSON.stringify(preview).includes("router-secret-1"), "the preview has names only");
  assert.deepEqual((await b.call("receiveAccept")).result, { added: 0, duplicates: 1, devAdded: 0, devSkipped: 0 });
  assert.match((await b.call("receiveAccept")).error, /No file/);

  assert.equal((await b.call("syncUnlink")).result.ok, true);
  assert.equal((await b.call("syncStatus")).result.folder, null);
  assert.ok(fs.existsSync(synced), "the folder's files stay");
  b.stop();
  assert.ok(!/router-secret|backend sync password/.test(b.stderr()));
});

test("kv sync / share / receive on the command line", { skip: process.platform !== "win32" && "unlocks through DPAPI remember-me" }, async () => {
  const { execFileSync } = await import("node:child_process");
  const { runCliFull } = await import("./helpers.ts");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kv-cli-sync-"));
  const cloud = fs.mkdtempSync(path.join(os.tmpdir(), "kv-cli-cloud-"));
  const setup = `import * as s from "./src/store.ts"; import * as r from "./src/remember.ts";
    const { key, data } = await s.create(${JSON.stringify(PW)});
    s.saveItem(data, { type: "login", title: "Router", fields: { password: "cli-share-secret" } });
    s.setEntry(data, "app", "API_KEY", "cli-dev-secret", "");
    await s.save(key, data); await r.remember(key, s.salt());`;
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", "--input-type=module", "-e", setup], {
    env: { ...process.env, KV_HOME: home },
  });
  const kv = (args: string[]) => runCliFull(home, args, {}, home);

  const key = /kvpk1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{4}/.exec((await kv(["share", "key"])).stdout)?.[0];
  assert.ok(key);
  assert.equal((await kv(["share", "app/API_KEY"])).code, 2, "--to is required");
  const shared = await kv(["share", "app/API_KEY", "--item", "Router", "--to", key!, "--out", "both.kvshare"]);
  assert.equal(shared.code, 0, shared.stderr);
  assert.ok(!fs.readFileSync(path.join(home, "both.kvshare"), "utf8").includes("cli-"));
  const got = await kv(["receive", "both.kvshare"]);
  assert.equal(got.code, 0, got.stderr);
  assert.match(got.stderr, /Added 0 items and 0 dev keys \(2 already here, skipped\)/);

  assert.equal((await kv(["sync"])).code, 1, "no folder yet");
  const linked = await kv(["sync", "link", cloud]);
  assert.equal(linked.code, 0, linked.stderr);
  assert.match(linked.stderr, /Sync is on/);
  const st = JSON.parse((await kv(["sync", "status", "--json"])).stdout);
  assert.equal(st.folder, cloud);
  assert.equal((await kv(["sync", "now", "--json"])).code, 0);
  assert.equal((await kv(["sync", "off"])).code, 0);
});
