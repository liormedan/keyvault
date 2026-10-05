import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

// The backend and CLI import .ts modules; Node runs them with type stripping
const NODE_TS = ["--experimental-strip-types", "--no-warnings=ExperimentalWarning"];

// Temporary vault — never the real one. All CSV data here is made up.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-import-"));
process.env.KV_HOME = HOME;
const store = await import("../src/store.ts");
const { parseCsv, csvToLogins } = await import("../src/import-csv.ts");
const PW = "import test";

const CHROME = [
  "name,url,username,password,note",
  "example.com,https://example.com/login,dana@example.com,pw-one,",
  '"Shop, Inc.",https://shop.example/account,dana,"pa""ss,word","line one\nline two"',
  "nopass.example,https://nopass.example/,dana,,",
  "",
].join("\r\n");

const FIREFOX = [
  '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"',
  '"https://example.com/login","dana@example.com","pw-one",,"https://example.com","{11111111-1111-1111-1111-111111111111}","1","2","3"',
  '"https://forum.example","dana","pw-three",,"","{22222222-2222-2222-2222-222222222222}","1","2","3"',
].join("\n");

test("csv parser: quotes, escaped quotes, commas and newlines inside fields, BOM", () => {
  const rows = parseCsv(`﻿a,b\r\n"x,1","he said ""hi"""\r\n"multi\nline",z\r\n`);
  assert.deepEqual(rows, [["a", "b"], ["x,1", 'he said "hi"'], ["multi\nline", "z"]]);
});

test("chrome export: columns by name, rows without a password skipped", () => {
  const { logins, skipped } = csvToLogins(CHROME);
  assert.equal(logins.length, 2);
  assert.equal(skipped, 1);
  assert.deepEqual(logins[1], {
    title: "Shop, Inc.",
    fields: { url: "https://shop.example/account", username: "dana", password: 'pa"ss,word', totp: "", notes: "line one\nline two" },
  });
});

test("firefox export: no name column — title falls back to the host", () => {
  const { logins } = csvToLogins(FIREFOX);
  assert.deepEqual(logins.map((l) => l.title), ["example.com", "forum.example"]);
});

test("a file that is not a password export is rejected", () => {
  assert.throws(() => csvToLogins("a,b\n1,2\n"), /Expected columns/);
  assert.throws(() => csvToLogins("only one line"), /empty/);
});

test("import into the vault: de-duplicates across files and re-imports", async () => {
  const { key, data } = await store.create(PW);
  assert.deepEqual(store.importLogins(data, csvToLogins(CHROME).logins), { added: 2, duplicates: 0 });
  assert.deepEqual(store.importLogins(data, csvToLogins(FIREFOX).logins), { added: 1, duplicates: 1 });
  assert.deepEqual(store.importLogins(data, csvToLogins(CHROME).logins), { added: 0, duplicates: 2 });
  await store.save(key, data);
  const opened = await store.unlockWithPassword(PW);
  const list = store.listItems(opened.data);
  assert.equal(list.length, 3);
  assert.ok(list.every((i) => i.type === "login"));
  assert.ok(!JSON.stringify(list).includes("pw-one"), "no passwords in the listing");
});

test("app backend: importCsv returns counts only; importCleanup deletes just that file", async () => {
  const csv = path.join(HOME, "Chrome Passwords.csv");
  const other = path.join(HOME, "keep.txt");
  fs.writeFileSync(csv, FIREFOX + '\n"https://new.example","dana","pw-new",,"","{3}","1","2","3"\n');
  fs.writeFileSync(other, "keep");
  const child = spawn(process.execPath, [...NODE_TS, fileURLToPath(new URL("../src/backend.js", import.meta.url))], {
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
    return JSON.parse((await lines.next()).value);
  };
  assert.equal((await call("importCsv", { path: csv })).error, "locked");
  assert.match((await call("importCleanup")).error, /No file to delete/);
  await call("unlock", { password: PW });
  assert.match((await call("importCsv", { path: path.join(HOME, "missing.csv") })).error, /File not found/);
  const res = await call("importCsv", { path: csv });
  assert.deepEqual(res.result, { added: 1, duplicates: 2, skipped: 0, file: "Chrome Passwords.csv" });
  assert.ok(!JSON.stringify(res).includes("pw-new"), "the reply carries no values");
  assert.equal((await call("importCleanup")).result.ok, true);
  assert.ok(!fs.existsSync(csv), "the imported CSV is deleted");
  assert.ok(fs.existsSync(other), "nothing else is touched");
  assert.match((await call("importCleanup")).error, /No file to delete/);
  assert.equal((await call("items")).result.items.length, 4);
  child.stdin.end();
  assert.ok(!stderr.includes("pw-"), "no values on stderr");
});
