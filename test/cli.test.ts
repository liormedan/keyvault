import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import pkg from "../package.json" with { type: "json" };
import { completion, SHELLS } from "../src/completion.ts";
import { runCliFull } from "./helpers.ts";

// The kv command against a temporary vault — never the real one
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-cli-"));
const PW = "cli test password";

test("kv --version and kv status --json", async () => {
  assert.equal((await runCliFull(HOME, ["--version"])).stdout.trim(), pkg.version);
  const st = JSON.parse((await runCliFull(HOME, ["status", "--json"])).stdout);
  assert.deepEqual(Object.keys(st).sort(), ["exists", "lang", "remembered", "vault", "version"]);
  assert.equal(st.exists, false);
  assert.equal(st.version, pkg.version);
});

test("exit codes: 2 for wrong arguments, 1 for failures", async () => {
  assert.equal((await runCliFull(HOME, ["nope"])).code, 2);
  assert.equal((await runCliFull(HOME, ["run"])).code, 2);
  assert.equal((await runCliFull(HOME, ["completion", "tcsh"])).code, 2);
  assert.equal((await runCliFull(HOME, ["ls"])).code, 1, "no vault yet");
});

test("kv ls --json lists names and notes, never values", { skip: process.platform !== "win32" && "unlocks through DPAPI remember-me" }, async () => {
  // kv init needs a terminal for the password — create and remember through the modules, in the temp folder
  const setup = `import * as s from "./src/store.ts"; import * as r from "./src/remember.ts";
    const { key, data } = await s.create(${JSON.stringify(PW)});
    s.setEntry(data, "demo", "API_KEY", "cli-secret-value", "a note");
    await s.save(key, data); await r.remember(key, s.salt());`;
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", "--input-type=module", "-e", setup], { env: { ...process.env, KV_HOME: HOME } });
  const out = await runCliFull(HOME, ["ls", "--json"]);
  assert.equal(out.code, 0, out.stderr);
  const list = JSON.parse(out.stdout);
  assert.deepEqual(Object.keys(list), ["demo"]);
  assert.deepEqual(Object.keys(list.demo[0]).sort(), ["key", "note", "updated"]);
  assert.equal(list.demo[0].note, "a note");
  assert.ok(!out.stdout.includes("cli-secret-value"), "no values in --json");
});

test("completion scripts: every shell, every command", () => {
  for (const shell of SHELLS) {
    const script = completion(shell);
    for (const c of ["set", "run", "import-passwords", "status", "completion"]) assert.ok(script.includes(c), `${shell}: ${c}`);
  }
  // bash syntax, where bash exists (CI on Ubuntu/macOS, Git Bash on Windows)
  try {
    execFileSync("bash", ["-n"], { input: completion("bash") });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
});
