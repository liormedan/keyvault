import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Item, VaultData } from "../src/model.ts";

// Temporary vaults and a temporary "cloud" folder — never the real ones
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-sync-"));
process.env.KV_HOME = HOME;
const store = await import("../src/store.ts");
const sync = await import("../src/sync.ts");

const T = (d: number) => new Date(Date.UTC(2026, 9, 1) + d * 3_600_000).toISOString(); // hour d after Oct 1
const item = (id: string, title: string, updated: string, fields: Record<string, string> = {}): Item => ({
  id,
  type: "login",
  title,
  fields,
  fav: false,
  created: T(0),
  updated,
});
const vault = (items: Item[], extra: Partial<VaultData> = {}): VaultData => ({
  created: T(0),
  projects: {},
  items: Object.fromEntries(items.map((i) => [i.id, i])),
  deleted: {},
  ...extra,
});

test("merge: union, newer wins, deletions win over older versions only", () => {
  const local = vault([item("a", "A", T(1), { password: "a1" }), item("b", "B new", T(5)), item("d", "D", T(2))], { deleted: { "item:c": T(4) } });
  const remote = vault([item("b", "B old", T(3)), item("c", "C", T(2)), item("d", "D edited", T(6)), item("e", "E", T(1))], { deleted: { "item:d": T(3) } });
  const { data, conflicts } = sync.merge(local, remote, T(4));
  assert.deepEqual(Object.keys(data.items).sort(), ["a", "b", "d", "e"]);
  assert.equal(data.items.b!.title, "B new", "newer wins");
  assert.equal(data.items.d!.title, "D edited", "edited after it was deleted elsewhere: kept");
  assert.equal(conflicts, 0, "B changed only here since the last sync");
  assert.deepEqual(data.deleted, { "item:c": T(4), "item:d": T(3) });
});

test("merge: changed on both sides since the last sync keeps both, and every computer makes the same copy", () => {
  const base = T(10);
  const mine = vault([item("x", "Bank", T(11), { password: "mine" })]);
  const theirs = vault([item("x", "Bank", T(12), { password: "theirs" })]);
  const here = sync.merge(mine, theirs, base);
  assert.equal(here.conflicts, 1);
  assert.equal(here.data.items.x!.fields.password, "theirs", "the newer one keeps the id");
  const copyId = sync.conflictId("x", T(11));
  assert.equal(here.data.items[copyId]!.fields.password, "mine");
  assert.match(here.data.items[copyId]!.title, /^Bank \(conflict 2026-10-01\)$/);
  // The other computer, merging the same two versions the other way round, ends up with the same two items
  const there = sync.merge(theirs, mine, base);
  assert.deepEqual(Object.keys(there.data.items).sort(), Object.keys(here.data.items).sort());
  // And once both have the copy, merging again changes nothing
  const again = sync.merge(here.data, there.data, T(13));
  assert.equal(again.conflicts, 0);
  assert.equal(Object.keys(again.data.items).length, 2);
});

test("merge: a star alone travels; dev keys newest wins with tombstones; local sync state stays local", () => {
  const starred = { ...item("s", "S", T(1)), fav: true, favAt: T(9) };
  const local = vault([item("s", "S", T(1))], {
    projects: { app: { API: { value: "old", note: "", updated: T(1) }, GONE: { value: "x", note: "", updated: T(1) } } },
    sync: { lastSync: T(2) },
    identity: { publicKey: "L", secretKey: "l" },
  });
  const remote = vault([starred], {
    projects: { app: { API: { value: "new", note: "", updated: T(3) } } },
    deleted: { "dev:app/GONE": T(4) },
    identity: { publicKey: "R", secretKey: "r" },
  });
  const { data } = sync.merge(local, remote, T(2));
  assert.equal(data.items.s!.fav, true);
  assert.deepEqual(Object.keys(data.projects.app!), ["API"]);
  assert.equal(data.projects.app!.API!.value, "new");
  assert.deepEqual(data.sync, { lastSync: T(2) });
  assert.equal(data.identity!.publicKey, "R", "the identity already in the folder wins");
});

test("sync through a folder: two computers, conflicted copies merged and removed, nothing in plain text", async () => {
  const cloud = fs.mkdtempSync(path.join(os.tmpdir(), "kv-cloud-"));
  const pw = "sync test password";
  const a = await store.create(pw);
  store.saveItem(a.data, { type: "login", title: "From A", fields: { password: "secret-from-a" } });
  await store.save(a.key, a.data);

  const created = await sync.link(cloud, a.key, a.data);
  assert.equal(created.mode, "created");
  const synced = path.join(cloud, sync.SYNC_FILE);
  assert.ok(!fs.readFileSync(synced, "utf8").includes("secret-from-a"), "the folder holds ciphertext");
  assert.equal(JSON.parse(fs.readFileSync(synced, "utf8")).kdf.salt, store.header().kdf.salt, "same header as the vault");
  assert.ok(a.data.sync?.lastSync, "lastSync recorded in this computer's vault");
  const inFolder = await store.openExport(synced, pw);
  assert.equal(inFolder.sync, undefined, "this computer's sync state stays out of the folder");

  // "Computer B" edits the folder's copy meanwhile, and its cloud client leaves a conflicted copy too
  const { seal } = await import("../src/crypto.ts");
  const b = structuredClone(inFolder);
  store.saveItem(b, { type: "note", title: "From B", fields: { body: "hello" } });
  fs.writeFileSync(synced, JSON.stringify(await seal(a.key, b, store.header())));
  const c = structuredClone(inFolder);
  store.saveItem(c, { type: "note", title: "From a conflicted copy", fields: { body: "x" } });
  const copy = path.join(cloud, "kv-vault (conflicted copy 2026-10-09).kv");
  fs.writeFileSync(copy, JSON.stringify(await seal(a.key, c, store.header())));

  // A saves: the after-save hook syncs
  sync.enableAutoSync();
  store.saveItem(a.data, { type: "login", title: "Later on A", fields: { password: "p" } });
  await store.save(a.key, a.data);
  const titles = Object.values(a.data.items)
    .map((i) => i.title)
    .sort();
  assert.deepEqual(titles, ["From A", "From B", "From a conflicted copy", "Later on A"], "the caller's object is updated in place");
  assert.ok(!fs.existsSync(copy), "the conflicted copy was merged and removed");
  assert.ok(!fs.existsSync(path.join(cloud, "kv-vault.lock")), "the lock is released");
  assert.equal(Object.keys((await store.openExport(synced, pw)).items).length, 4);
  assert.equal(Object.keys((await store.unlockWithPassword(pw)).data.items).length, 4);
  assert.deepEqual(sync.syncStatus(a.data).folder, cloud);
  store.setAfterSave(null);
  sync.unlink();
  assert.equal(sync.syncFolder(), null);
});

test("joining another computer's vault: its password from now on, nothing from here lost", async () => {
  const cloud = fs.mkdtempSync(path.join(os.tmpdir(), "kv-cloud-join-"));
  // The vault already in the folder, made on "computer B" with its own password and salt
  const homeB = fs.mkdtempSync(path.join(os.tmpdir(), "kv-sync-b-"));
  const { newKdfParams, deriveKey, seal } = await import("../src/crypto.ts");
  const kdf = await newKdfParams();
  const keyB = await deriveKey("password of B", kdf);
  const dataB = vault([item("b1", "B's login", T(1), { password: "b-secret" })]);
  fs.writeFileSync(path.join(cloud, sync.SYNC_FILE), JSON.stringify(await seal(keyB, dataB, { v: 1, kdf })));
  fs.rmSync(homeB, { recursive: true, force: true });

  // This computer's vault: the one from the previous test, password "sync test password"
  const here = await store.unlockWithPassword("sync test password");
  const before = Object.keys(here.data.items).length;
  await assert.rejects(sync.link(cloud, here.key, here.data), /sync\.needPassword/);
  await assert.rejects(sync.link(cloud, here.key, here.data, "wrong"), /Wrong/);
  const joined = await sync.link(cloud, here.key, here.data, "password of B");
  assert.equal(joined.mode, "joined");
  assert.ok(joined.key);
  assert.equal(Object.keys(here.data.items).length, before + 1);
  await assert.rejects(store.unlockWithPassword("sync test password"), /Wrong/);
  assert.equal(Object.keys((await store.unlockWithPassword("password of B")).data.items).length, before + 1, "the vault now opens with B's password");
  assert.equal(store.header().kdf.salt, kdf.salt);
  sync.unlink();
});
