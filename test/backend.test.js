import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

// The desktop backend against a temporary vault — never the real one
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-backend-"));
const PW = "backend test password";

function start() {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/backend.js", import.meta.url))], {
    env: { ...process.env, KV_HOME: HOME },
    stdio: ["pipe", "pipe", "pipe"],
  });
  after(() => child.kill());
  let stderr = "";
  child.stderr.on("data", (c) => (stderr += c));
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const call = async (method, params) => {
    child.stdin.write(`${JSON.stringify({ id: ++id, method, params })}\n`);
    const { value } = await lines.next();
    const res = JSON.parse(value);
    assert.equal(res.id, id);
    return res;
  };
  return { call, stop: () => child.stdin.end(), stderr: () => stderr };
}

test("app backend: create, lock, unlock, CRUD, no values on stderr", async () => {
  const b = start();
  assert.equal((await b.call("status")).result.exists, false);
  assert.match((await b.call("init", { password: "" })).error, /empty/);
  assert.equal((await b.call("init", { password: PW })).result.ok, true);

  assert.equal((await b.call("set", { p: "demo", k: "API_KEY", value: "v-123", note: "n" })).result.ok, true);
  assert.match((await b.call("set", { p: "a/b", k: "X", value: "1" })).error, /no \/ in the project name/);
  const list = (await b.call("list")).result.projects;
  assert.deepEqual(Object.keys(list.demo[0]).sort(), ["key", "note", "updated"], "listing without values");
  assert.equal((await b.call("value", { p: "demo", k: "API_KEY" })).result.value, "v-123");

  await b.call("lock");
  assert.equal((await b.call("list")).error, "locked");
  assert.match((await b.call("unlock", { password: "wrong password!!" })).error, /Wrong master password/);
  assert.equal((await b.call("unlock", { password: PW })).result.ok, true);
  assert.equal((await b.call("value", { p: "demo", k: "API_KEY" })).result.value, "v-123");

  assert.equal((await b.call("delete", { p: "demo", k: "API_KEY" })).result.ok, true);
  assert.deepEqual((await b.call("list")).result.projects, {});
  assert.match((await b.call("nope")).error, /Unknown action/);
  b.stop();
  assert.ok(!b.stderr().includes("v-123"), "the value is not written to stderr");
});

test("app backend: remember (DPAPI) in the temp folder", { skip: process.platform !== "win32" }, async () => {
  const a = start();
  assert.equal((await a.call("unlock", { password: PW, remember: true })).result.ok, true);
  a.stop();
  assert.ok(fs.existsSync(path.join(HOME, "key.dpapi")));

  const b = start();
  assert.equal((await b.call("status")).result.remembered, true);
  assert.equal((await b.call("unlock", {})).result.ok, true, "opens without a password");
  await b.call("forget");
  await b.call("lock");
  assert.match((await b.call("unlock", {})).error, /Master password required/);
  b.stop();
});

test("app backend: closing stdin finishes a pending save before exiting", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kv-backend-close-"));
  const script = fileURLToPath(new URL("../src/backend.js", import.meta.url));
  const run = (lines) => new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, KV_HOME: home }, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("exit", () => resolve(out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))));
    child.stdin.end(lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); // write and close at once
  });
  const first = await run([
    { id: 1, method: "init", params: { password: PW } },
    { id: 2, method: "set", params: { p: "demo", k: "K", value: "kept" } },
  ]);
  assert.equal(first.length, 2, "both requests answered before exit");
  const second = await run([
    { id: 1, method: "unlock", params: { password: PW } },
    { id: 2, method: "value", params: { p: "demo", k: "K" } },
  ]);
  assert.equal(second[1].result.value, "kept");
});

test("app backend: setLang switches error messages to Hebrew and back", async () => {
  const b = start();
  assert.match((await b.call("nope")).error, /Unknown action/);
  assert.equal((await b.call("setLang", { lang: "he" })).result.lang, "he");
  assert.match((await b.call("nope")).error, /פעולה לא מוכרת/);
  assert.match((await b.call("setLang", { lang: "fr" })).error, /שפה לא מוכרת/);
  await b.call("setLang", { lang: "en" });
  assert.match((await b.call("nope")).error, /Unknown action/);
  b.stop();
});

test("cli: English by default, Hebrew with KV_LANG or kv lang", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kv-lang-"));
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  const run = (args, env = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, [cli, ...args], { env: { ...process.env, KV_HOME: home, KV_LANG: "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    c.on("exit", () => resolve(out));
  });
  assert.match(await run(["ls"]), /No vault at/);
  assert.match(await run(["ls"], { KV_LANG: "he" }), /אין כספת/);
  await run(["lang", "he"]);
  assert.match(await run(["ls"]), /אין כספת/, "kv lang he is remembered");
  assert.match(await run(["help"]), /כספת מקומית/);
  await run(["lang", "en"]);
  assert.match(await run(["help"]), /a local vault/);
});
