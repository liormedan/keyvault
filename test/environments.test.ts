import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Per-environment values, renames and .kv.json — against a temporary vault and temp folders
process.env.KV_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-envs-"));
const store = await import("../src/store.ts");
const { findProject, suggestName, writeProject } = await import("../src/project.ts");

test("environments: default value, overrides, fallback, delete one environment", async () => {
  const { key, data } = await store.create("envs test");
  store.setEntry(data, "app", "DB_URL", "postgres://dev");
  store.setEntry(data, "app", "DB_URL", "postgres://prod", undefined, "prod");
  store.setEntry(data, "app", "PROD_ONLY", "p-1", undefined, "prod");
  store.setEntry(data, "app", "SHARED", "s-1");

  assert.deepEqual(store.projectValues(data, "app"), { DB_URL: "postgres://dev", SHARED: "s-1" }, "no env: defaults only");
  assert.deepEqual(store.projectValues(data, "app", "prod"), { DB_URL: "postgres://prod", PROD_ONLY: "p-1", SHARED: "s-1" });
  assert.deepEqual(store.projectValues(data, "app", "staging"), { DB_URL: "postgres://dev", SHARED: "s-1" }, "unknown env falls back");
  assert.equal(store.entryValue(data, "app", "DB_URL", "prod"), "postgres://prod");
  assert.throws(() => store.entryValue(data, "app", "PROD_ONLY"), /no value for default/);
  assert.deepEqual(store.listing(data).app!.find((e) => e.key === "DB_URL")!.envs, ["prod"]);

  store.deleteEntry(data, "app", "DB_URL", "prod");
  assert.equal(store.entryValue(data, "app", "DB_URL", "prod"), "postgres://dev", "back to the default");
  store.deleteEntry(data, "app", "PROD_ONLY", "prod");
  assert.equal(data.projects.app!.PROD_ONLY, undefined, "no default and no environments left: the key is gone");

  await store.save(key, data);
  const reopened = await store.unlockWithPassword("envs test");
  assert.equal(store.entryValue(reopened.data, "app", "SHARED"), "s-1");
});

test("rename a key, move it across projects, rename a project", async () => {
  const { data } = await store.unlockWithPassword("envs test");
  store.renameEntry(data, ["app", "SHARED"], ["app", "SHARED_KEY"]);
  store.renameEntry(data, ["app", "SHARED_KEY"], ["other", "SHARED_KEY"]);
  assert.equal(store.entryValue(data, "other", "SHARED_KEY"), "s-1");
  store.setEntry(data, "other", "TAKEN", "x");
  assert.throws(() => store.renameEntry(data, ["other", "SHARED_KEY"], ["other", "TAKEN"]), /already exists/);
  store.renameProject(data, "other", "renamed");
  assert.equal(data.projects.other, undefined);
  assert.equal(store.entryValue(data, "renamed", "TAKEN"), "x");
  assert.throws(() => store.renameProject(data, "renamed", "app"), /already exists/);
});

test(".kv.json: found from a subfolder, default env, bad files rejected", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kv-proj-"));
  const sub = path.join(root, "packages", "web");
  fs.mkdirSync(sub, { recursive: true });
  assert.equal(findProject(sub), null);
  writeProject(root, { project: "my-app", env: "dev" });
  assert.deepEqual(findProject(sub), { project: "my-app", env: "dev", dir: root });
  assert.throws(() => writeProject(root, { project: "x" }), /already exists/);
  fs.writeFileSync(path.join(sub, ".kv.json"), JSON.stringify({ project: "a/b" }));
  assert.throws(() => findProject(sub), /not a valid kv project file/);
  fs.writeFileSync(path.join(sub, "package.json"), JSON.stringify({ name: "@scope/web-app" }));
  assert.equal(suggestName(sub), "web-app");
});
