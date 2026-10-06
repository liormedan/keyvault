import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { diff, githubSecretNames, pullVercel, push, runTool, type Runner, vercelTarget } from "../src/platforms.ts";
import { runCliFull } from "./helpers.ts";

const parseEnv = (text: string) => Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
  const i = l.indexOf("=");
  return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, "$1")];
}));

/** Records every call; values must arrive on stdin and never in args */
function recorder(reply: (cmd: string, args: string[]) => { status?: number; stdout?: string } = () => ({})) {
  const calls: { cmd: string; args: string[]; input?: string }[] = [];
  const run: Runner = (cmd, args, { input }) => {
    calls.push({ cmd, args, ...(input !== undefined ? { input } : {}) });
    const r = reply(cmd, args);
    return { status: r.status ?? 0, stdout: r.stdout ?? "", stderr: "" };
  };
  return { calls, run };
}

test("the real runner refuses shell metacharacters in arguments (Windows runs platform CLIs through cmd)", () => {
  for (const bad of ["x&calc", "a;b", "$(x)", "%PATH%", "a|b", 'a"b', "a^b", "a>b", "`id`"]) {
    assert.throws(() => runTool("vercel", ["env", "add", bad], {}), /Refusing to pass/, bad);
  }
});

test("vercel target from the kv environment", () => {
  assert.equal(vercelTarget(undefined), "development");
  assert.equal(vercelTarget("prod"), "production");
  assert.equal(vercelTarget("staging"), "preview");
  assert.equal(vercelTarget("prod", "preview"), "preview", "--target wins");
  assert.throws(() => vercelTarget(undefined, "live"), /Unknown Vercel target/);
});

test("push: one call per key, the value only on stdin", () => {
  const values = { API_KEY: "s3cret value", DB_URL: "postgres://x" };
  const v = recorder();
  assert.deepEqual(push("vercel", values, { target: "production", sensitive: true }, v.run), ["API_KEY", "DB_URL"]);
  assert.deepEqual(v.calls[0], { cmd: "vercel", args: ["env", "add", "API_KEY", "production", "--force", "--sensitive"], input: "s3cret value" });
  const g = recorder();
  push("github", values, { repo: "me/app", environment: "prod" }, g.run);
  assert.deepEqual(g.calls[1], { cmd: "gh", args: ["secret", "set", "DB_URL", "--repo", "me/app", "--env", "prod"], input: "postgres://x" });
  for (const c of [...v.calls, ...g.calls]) assert.ok(!c.args.some((a) => a.includes("s3cret")), "never in args");
});

test("push refuses names a platform would reject, and reports the CLI's error", () => {
  assert.throws(() => push("vercel", { "BAD-NAME": "x" }, {}, recorder().run), /not a valid environment variable name/);
  const failing = recorder(() => ({ status: 1, stdout: "Error: not linked" }));
  assert.throws(() => push("vercel", { A: "x" }, {}, failing.run), /vercel failed A: Error: not linked/);
});

test("pull: through a temp file that is gone afterwards; Vercel's own variables dropped", () => {
  let pulledTo = "";
  const v = recorder((_cmd, args) => {
    pulledTo = args[2]!;
    fs.writeFileSync(pulledTo, 'API_KEY="from-vercel"\nVERCEL_ENV="production"\nVERCEL_URL="x.vercel.app"\n');
    return {};
  });
  assert.deepEqual(pullVercel("production", undefined, parseEnv, v.run), { API_KEY: "from-vercel" });
  assert.deepEqual(v.calls[0]!.args.slice(3), ["--environment", "production", "--yes"]);
  assert.equal(fs.existsSync(pulledTo), false, "the pulled file is deleted");
});

test("diff: names, and values by hash where the platform shows them", () => {
  const vault = { A: "1", B: "2", C: "3" };
  assert.deepEqual(diff(vault, ["A", "B", "D"], { A: "1", B: "changed", D: "4" }), { onlyVault: ["C"], onlyPlatform: ["D"], changed: ["B"], same: 1 });
  assert.deepEqual(diff(vault, ["A", "D"]), { onlyVault: ["B", "C"], onlyPlatform: ["D"], changed: [], same: 1 }, "names only (GitHub)");
  const g = recorder(() => ({ stdout: JSON.stringify([{ name: "B" }, { name: "A" }]) }));
  assert.deepEqual(githubSecretNames({ repo: "me/app" }, g.run), ["A", "B"]);
});

// ── kv itself against fake vercel / gh on PATH (Windows: unlocks through DPAPI remember-me) ──

test("kv push / pull / diff end to end with fake platform CLIs", { skip: process.platform !== "win32" && "unlocks through DPAPI remember-me" }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kv-plat-"));
  const setup = `import * as s from "./src/store.ts"; import * as r from "./src/remember.ts";
    const { key, data } = await s.create("plat pw");
    s.setEntry(data, "web", "API_KEY", "dev-key");
    s.setEntry(data, "web", "API_KEY", "prod-key", undefined, "prod");
    s.setEntry(data, "web", "ONLY_HERE", "x");
    await s.save(key, data); await r.remember(key, s.salt());`;
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", "--input-type=module", "-e", setup], { env: { ...process.env, KV_HOME: home } });

  // fake CLIs: log argv + stdin; `vercel env pull` writes a dotenv; `gh secret list` prints names
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "kv-fakebin-"));
  const log = path.join(bin, "calls.jsonl");
  const fake = path.join(bin, "fake.mjs");
  fs.writeFileSync(fake, `import fs from "node:fs";
    const [tool, ...args] = process.argv.slice(2);
    const input = fs.readFileSync(0, "utf8");
    fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ tool, args, input }) + "\\n");
    if (tool === "vercel" && args[1] === "pull") fs.writeFileSync(args[2], 'API_KEY="prod-key"\\nFROM_VERCEL="v"\\nVERCEL_ENV="production"\\n');
    if (tool === "gh" && args[1] === "list") process.stdout.write(JSON.stringify([{ name: "API_KEY" }, { name: "ON_GITHUB" }]));`);
  for (const tool of ["vercel", "gh"]) fs.writeFileSync(path.join(bin, `${tool}.cmd`), `@node "${fake}" ${tool} %*\r\n`);
  const env = { PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const calls = () => fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { tool: string; args: string[]; input: string });

  const pushed = await runCliFull(home, ["push", "vercel", "web", "--env", "prod"], env);
  assert.equal(pushed.code, 0, pushed.stderr);
  assert.deepEqual(calls().map((c) => [c.args.slice(0, 4).join(" "), c.input]), [["env add API_KEY production", "prod-key"], ["env add ONLY_HERE production", "x"]]);
  assert.ok(!pushed.stderr.includes("prod-key"), "values are not printed");

  const d = await runCliFull(home, ["diff", "vercel", "web", "--env", "prod", "--json"], env);
  assert.deepEqual(JSON.parse(d.stdout), { onlyVault: ["ONLY_HERE"], onlyPlatform: ["FROM_VERCEL"], changed: [], same: 1 });
  assert.equal(d.code, 1, "differences → exit 1");

  const gd = await runCliFull(home, ["diff", "github", "web", "--repo", "me/web", "--json"], env);
  assert.deepEqual(JSON.parse(gd.stdout), { onlyVault: ["ONLY_HERE"], onlyPlatform: ["ON_GITHUB"], changed: [], same: 1 });

  assert.equal((await runCliFull(home, ["pull", "vercel", "web", "--env", "prod"], env)).code, 0);
  const listed = JSON.parse((await runCliFull(home, ["ls", "--json"], env)).stdout) as Record<string, { key: string; envs?: string[] }[]>;
  assert.deepEqual(listed.web!.map((e) => [e.key, e.envs ?? []]), [["API_KEY", ["prod"]], ["FROM_VERCEL", ["prod"]], ["ONLY_HERE", []]]);

  assert.equal((await runCliFull(home, ["push", "netlify", "web"], env)).code, 2);
  assert.equal((await runCliFull(home, ["pull", "github", "web"], env)).code, 2, "GitHub secrets can't be read back");
});
