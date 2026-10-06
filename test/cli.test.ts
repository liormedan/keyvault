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
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", "--input-type=module", "-e", setup], {
    env: { ...process.env, KV_HOME: HOME },
  });
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

test("project workflow: init-project, run without a name, env formats, example, check, mv", {
  skip: process.platform !== "win32" && "unlocks through DPAPI remember-me",
}, async () => {
  // a vault with tricky values, remembered in the temp folder (same setup as the ls --json test)
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kv-cli-proj-"));
  const tricky = 'it\'s "quoted" $HOME ` back\\slash';
  const setup = `import * as s from "./src/store.ts"; import * as r from "./src/remember.ts";
    const { key, data } = await s.create("proj pw");
    s.setEntry(data, "web", "API_KEY", "dev-key");
    s.setEntry(data, "web", "API_KEY", "prod-key", undefined, "prod");
    s.setEntry(data, "web", "TRICKY", ${JSON.stringify(tricky)});
    await s.save(key, data); await r.remember(key, s.salt());`;
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", "--input-type=module", "-e", setup], {
    env: { ...process.env, KV_HOME: home },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kv-cli-repo-"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "web" }));
  const kv = (args: string[]) => runCliFull(home, args, {}, dir);

  assert.equal((await kv(["init-project"])).code, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, ".kv.json"), "utf8")), { project: "web" });

  const printEnv = ["--", process.execPath, "-e", "process.stdout.write(process.env.API_KEY + '|' + process.env.TRICKY)"];
  assert.equal((await kv(["run", ...printEnv])).stdout, `dev-key|${tricky}`, "project from .kv.json");
  assert.equal((await kv(["run", "--env", "prod", ...printEnv])).stdout, `prod-key|${tricky}`);

  assert.deepEqual(JSON.parse((await kv(["env", "--format", "json"])).stdout), { API_KEY: "dev-key", TRICKY: tricky });
  // what eval gets back is exactly the value — quotes, $ and backslashes are not interpreted
  const sh = (await kv(["env", "--format", "sh"])).stdout;
  assert.equal(execFileSync("bash", ["-c", 'eval "$(cat)"; printf %s "$TRICKY"'], { input: sh, encoding: "utf8" }), tricky);
  const pwsh = (await kv(["env", "--format", "pwsh", "--env", "prod"])).stdout;
  assert.equal(
    execFileSync("powershell.exe", ["-NoProfile", "-Command", "Invoke-Expression ([Console]::In.ReadToEnd()); [Console]::Out.Write($env:API_KEY)"], {
      input: pwsh,
      encoding: "utf8",
    }),
    "prod-key",
  );

  assert.equal((await kv(["example"])).stdout, "API_KEY=\nTRICKY=\n");
  fs.writeFileSync(path.join(dir, ".env.example"), "API_KEY=\nMISSING_ONE=\n");
  const check = await kv(["check"]);
  assert.equal(check.code, 1);
  assert.match(check.stderr, /MISSING_ONE/);

  assert.equal((await kv(["mv", "web/TRICKY", "web/QUOTED"])).code, 0);
  assert.equal((await kv(["mv", "web", "site"])).code, 0);
  assert.deepEqual(Object.keys(JSON.parse((await kv(["ls", "--json"])).stdout)), ["site"]);
  assert.equal((await kv(["run", ...printEnv])).code, 1, ".kv.json still says web, which no longer exists");
});
