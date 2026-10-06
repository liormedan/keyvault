import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { addedLines, findLeaks, installHook, secretsOf, uninstallHook } from "../src/guard.ts";
import type { VaultData } from "../src/model.ts";
import { scan } from "../src/scan.ts";
import { runCliFull } from "./helpers.ts";

const vault: VaultData = {
  created: "",
  projects: {
    web: {
      API_KEY: { value: "sk_live_0123456789", note: "", updated: "", envs: { prod: { value: "prod-secret-value-42", updated: "" } } },
      PORT: { value: "8080", note: "", updated: "" },
    },
  },
  items: {
    a: { id: "a", type: "login", title: "GitHub", fields: { username: "dana", password: "correct-horse-battery" }, fav: false, created: "", updated: "" },
  },
};

test("secretsOf: dev keys in every environment and secret item fields; short values skipped", () => {
  assert.deepEqual(
    secretsOf(vault)
      .map((s) => s.name)
      .sort(),
    ["GitHub · Password", "web/API_KEY", "web/API_KEY (prod)"],
  );
});

test("addedLines: file and new line numbers from a unified diff", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -3,0 +4,2 @@",
    "+const k = 1;",
    "+const j = 2;",
    "@@ -10 +12 @@",
    "-old",
    "+new line",
    "--- a/gone.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-x",
  ].join("\n");
  assert.deepEqual(addedLines(diff), [
    { file: "src/a.ts", line: 4, text: "const k = 1;" },
    { file: "src/a.ts", line: 5, text: "const j = 2;" },
    { file: "src/a.ts", line: 12, text: "new line" },
  ]);
});

test("findLeaks: reports file, line and name — never the value", () => {
  const found = findLeaks(vault, [
    { file: "config.ts", line: 7, text: `const key = "sk_live_0123456789";` },
    { file: ".env", line: 2, text: "PASSWORD=correct-horse-battery" },
    { file: "server.ts", line: 1, text: "listen(8080)" },
  ]);
  assert.deepEqual(found, [
    { file: "config.ts", line: 7, name: "web/API_KEY" },
    { file: ".env", line: 2, name: "GitHub · Password" },
  ]);
  assert.ok(!JSON.stringify(found).includes("sk_live"), "no values in findings");
});

test("pre-commit hook: install, refuse to overwrite someone else's, uninstall", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kv-guard-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  const hook = installHook(repo);
  assert.match(fs.readFileSync(hook, "utf8"), /kv guard \|\| exit 1/);
  assert.equal(installHook(repo), hook, "reinstalling our own hook is fine");
  fs.writeFileSync(hook, "#!/bin/sh\nnpm test\n");
  assert.throws(() => installHook(repo), /isn't kv's/);
  assert.equal(uninstallHook(repo), null, "not ours — left alone");
  installHook(repo, true);
  assert.equal(uninstallHook(repo), hook);
  assert.equal(fs.existsSync(hook), false);
});

test("scan: .env files, templates, key files; what's already in the vault; tracked by git", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kv-scan-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "node_modules", "dep"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: app });
  fs.writeFileSync(path.join(app, ".env"), "API_KEY=sk_live_0123456789\nNEW_SECRET=not-in-vault-yet\nPORT=8080\n");
  fs.writeFileSync(path.join(app, ".env.example"), "API_KEY=your-key-here\n");
  fs.writeFileSync(path.join(app, "node_modules", "dep", ".env"), "IGNORED=1\n");
  fs.writeFileSync(path.join(app, "id_ed25519"), "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n");
  fs.writeFileSync(path.join(app, "public.pem"), "-----BEGIN CERTIFICATE-----\n");
  execFileSync("git", ["add", ".env.example"], { cwd: app });

  const found = scan(root, vault);
  assert.deepEqual(
    found.map((f) => [path.relative(root, f.file), f.kind, f.tracked]),
    [
      [path.join("app", ".env"), "env", false],
      [path.join("app", ".env.example"), "template", true],
      [path.join("app", "id_ed25519"), "ssh-private-key", false],
    ],
    "node_modules skipped; a certificate is not a secret",
  );
  const env = found[0]!.vars!;
  assert.deepEqual(
    env.map((v) => [v.name, v.filled, v.inVault ?? null]),
    [
      ["API_KEY", true, "web/API_KEY"],
      ["NEW_SECRET", true, null],
      ["PORT", false, null],
    ],
  );
  assert.ok(!JSON.stringify(found).includes("not-in-vault-yet"), "no values in the scan result");
});

test("kv guard stops a commit with a vault value (Windows: unlocks through DPAPI remember-me)", {
  skip: process.platform !== "win32" && "unlocks through DPAPI remember-me",
}, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kv-guard-home-"));
  const setup = `import * as s from "./src/store.ts"; import * as r from "./src/remember.ts";
    const { key, data } = await s.create("guard pw");
    s.setEntry(data, "web", "API_KEY", "sk_live_0123456789");
    await s.save(key, data); await r.remember(key, s.salt());`;
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", "--input-type=module", "-e", setup], {
    env: { ...process.env, KV_HOME: home },
  });
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kv-guard-cli-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "ok.ts"), "export const x = 1;\n");
  execFileSync("git", ["add", "ok.ts"], { cwd: repo });
  assert.equal((await runCliFull(home, ["guard"], {}, repo)).code, 0, "clean");

  fs.writeFileSync(path.join(repo, "config.ts"), 'export const k = "sk_live_0123456789";\n');
  execFileSync("git", ["add", "config.ts"], { cwd: repo });
  const r = await runCliFull(home, ["guard"], {}, repo);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /config\.ts:1 {2}web\/API_KEY/);
  assert.ok(!r.stderr.includes("sk_live"), "the value is not printed");

  const locked = await runCliFull(fs.mkdtempSync(path.join(os.tmpdir(), "kv-guard-nohome-")), ["guard"], {}, repo);
  assert.equal(locked.code, 0, "no vault / locked: skips by default");
  assert.equal((await runCliFull(fs.mkdtempSync(path.join(os.tmpdir(), "kv-guard-nohome2-")), ["guard", "--strict"], {}, repo)).code, 1, "--strict blocks");
});
