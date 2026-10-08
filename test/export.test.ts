import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runCliFull, startBackend } from "./helpers.ts";

// Temporary vault — never the real one
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-export-"));
process.env.KV_HOME = HOME;
const store = await import("../src/store.ts");
const { canonicalCode, recoveryCode } = await import("../src/crypto.ts");
const PW = "export test password";
const out = (name: string) => path.join(HOME, name);

test("export: a separate password opens it, the master password doesn't; never overwrites", async () => {
  const { data } = await store.create(PW);
  store.setEntry(data, "demo", "API_KEY", "export-secret-1");
  await store.exportTo(out("a.kv"), data, "file password");
  const file = JSON.parse(fs.readFileSync(out("a.kv"), "utf8"));
  assert.deepEqual(Object.keys(file).sort(), ["ct", "kdf", "nonce", "v"], "the vault file format");
  assert.notEqual(file.kdf.salt, store.readFile().kdf.salt, "fresh KDF salt");
  assert.ok(!fs.readFileSync(out("a.kv"), "utf8").includes("export-secret-1"));
  assert.equal((await store.openExport(out("a.kv"), "file password")).projects.demo!.API_KEY!.value, "export-secret-1");
  await assert.rejects(store.openExport(out("a.kv"), PW), /Wrong/);
  await assert.rejects(store.exportTo(out("a.kv"), data, "other"), /already exists/);
  await assert.rejects(store.exportTo(out("b.kv"), data, ""), /empty/);
  fs.writeFileSync(out("junk.kv"), "not json");
  await assert.rejects(store.openExport(out("junk.kv"), "x"), /not a kv-vault export/);
});

test("recovery code: 32 unambiguous characters in groups of four; typed in any case, with or without dashes", async () => {
  const code = await recoveryCode();
  assert.match(code, /^([A-HJKMNP-Z2-9]{4}-){7}[A-HJKMNP-Z2-9]{4}$/);
  assert.notEqual(code, await recoveryCode());
  const data = { created: new Date().toISOString(), projects: {}, items: {} };
  store.setEntry(data, "demo", "API_KEY", "export-secret-2");
  await store.exportTo(out("code.kv"), data, canonicalCode(code));
  for (const typed of [code, code.toLowerCase(), code.replace(/-/g, ""), code.replace(/-/g, " ")]) {
    assert.ok((await store.openExport(out("code.kv"), typed)).projects.demo, `opens with ${typed.slice(0, 6)}…`);
  }
  await assert.rejects(store.openExport(out("code.kv"), code.replace(/^./, code[0] === "A" ? "B" : "A")), /Wrong/);
});

test("app backend: exportVault, health, itemTotp; nothing secret on stderr", async () => {
  const b = startBackend(HOME);
  assert.equal((await b.call("health")).error, "locked");
  assert.equal((await b.call("exportVault", { path: out("x.kv") })).error, "locked");
  await b.call("unlock", { password: PW });
  const login = await b.call("itemSave", { type: "login", title: "Mail", fields: { username: "dana", password: "qwerty", totp: "JBSWY3DPEHPK3PXP" } });
  const plain = await b.call("itemSave", { type: "login", title: "Shop", fields: { password: "qwerty" } });

  const code = (await b.call("itemTotp", { id: login.result.id })).result;
  assert.match(code.code, /^\d{6}$/);
  assert.ok(code.remaining >= 1 && code.remaining <= 30);
  assert.match((await b.call("itemTotp", { id: plain.result.id })).error, /no two-factor key/);

  const h = (await b.call("health")).result;
  assert.equal(h.reused.length, 1);
  assert.deepEqual(
    h.weak.map((w: { reason: string }) => w.reason),
    ["common", "common"],
  );
  assert.ok(!JSON.stringify(h).includes("qwerty"), "names only");

  const withCode = (await b.call("exportVault", { path: out("backend-code.kv") })).result;
  assert.match(withCode.code, /^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
  assert.equal((await store.openExport(out("backend-code.kv"), withCode.code)).items[login.result.id]!.title, "Mail");
  assert.deepEqual((await b.call("exportVault", { path: out("backend-pw.kv"), password: "pw for file" })).result, {});
  assert.ok(await store.openExport(out("backend-pw.kv"), "pw for file"));
  assert.match((await b.call("exportVault", { path: out("backend-pw.kv"), password: "x" })).error, /already exists/);
  b.stop();
  assert.ok(!/qwerty|JBSWY3DP|pw for file/.test(b.stderr()));
});

test("kv restore: usage, and refuses to replace a vault without --force (before asking anything)", async () => {
  assert.equal((await runCliFull(HOME, ["restore"])).code, 2);
  const r = await runCliFull(HOME, ["restore", out("a.kv")]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /already exists.*--force/);
  assert.equal((await runCliFull(HOME, ["export"])).code, 2);
  assert.equal((await runCliFull(HOME, ["audit", "extra"])).code, 2);
});

test("kv audit --json and kv export --recovery-code", { skip: process.platform !== "win32" && "unlocks through DPAPI remember-me" }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kv-export-cli-"));
  // No terminal for a password in tests — create and remember through the modules, in the temp folder
  const setup = `import * as s from "./src/store.ts"; import * as r from "./src/remember.ts";
    const { key, data } = await s.create(${JSON.stringify(PW)});
    s.saveItem(data, { type: "login", title: "Forum", fields: { password: "123456" } });
    s.saveItem(data, { type: "login", title: "Mail", fields: { password: "same-Long-pass-1" } });
    s.saveItem(data, { type: "login", title: "Shop", fields: { password: "same-Long-pass-1" } });
    await s.save(key, data); await r.remember(key, s.salt());`;
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", "--input-type=module", "-e", setup], {
    env: { ...process.env, KV_HOME: home },
  });
  const audit = await runCliFull(home, ["audit", "--json"]);
  assert.equal(audit.code, 0, audit.stderr);
  const report = JSON.parse(audit.stdout);
  assert.equal(report.checked, 3);
  assert.deepEqual(
    report.reused[0].map((i: { title: string }) => i.title),
    ["Mail", "Shop"],
  );
  assert.equal(report.weak[0].reason, "common");
  assert.ok(!/123456|same-Long-pass-1/.test(audit.stdout + audit.stderr), "names only");

  const text = await runCliFull(home, ["audit"]);
  assert.match(text.stdout, /Reused/);
  assert.match(text.stdout, /Forum — very common/);

  const file = path.join(home, "rescue.kv");
  const ex = await runCliFull(home, ["export", file, "--recovery-code"]);
  assert.equal(ex.code, 0, ex.stderr);
  const code = /([A-Z2-9]{4}(?:-[A-Z2-9]{4}){7})/.exec(ex.stderr)?.[1];
  assert.ok(code, "the code is shown once");
  assert.ok(!ex.stdout.includes(code!), "on stderr, not stdout");
  process.env.KV_HOME = home;
  assert.equal(Object.keys((await store.openExport(file, code!)).items).length, 3);
  process.env.KV_HOME = HOME;
});
