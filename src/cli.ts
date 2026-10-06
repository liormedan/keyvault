#!/usr/bin/env node
// kv — a local, encrypted vault for development keys.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };
import { completion, SHELLS, type Shell } from "./completion.ts";
import { getLang } from "./i18n.ts";
import * as remember from "./remember.ts";
import { saveLang, t } from "./i18n.ts";
import { readLoginsFile } from "./import-csv.ts";
import { findProject, suggestName, writeProject } from "./project.ts";
import { copyWithClear, readHidden, readStdin } from "./io.ts";
import * as store from "./store.ts";

const argv = process.argv.slice(2);
const cmd = argv.shift();
// kv's own arguments stop at "--": everything after belongs to the command `kv run` starts
const dashdash = argv.indexOf("--");
const args = dashdash >= 0 ? argv.slice(0, dashdash) : argv;
const passthrough = dashdash >= 0 ? argv.slice(dashdash + 1) : [];
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name: string): boolean => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
/** The project named on the command line, else the one in .kv.json; and the environment (--env, else .kv.json) */
function resolveProject(): { project: string; env?: string } {
  const env = flag("--env"); // flags first: `kv env --env prod` must not read "--env" as the project
  const named = args.find((a) => !a.startsWith("--"));
  if (named) args.splice(args.indexOf(named), 1);
  if (named) return { project: named, ...(env ? { env } : {}) };
  const found = findProject();
  if (!found) throw new UsageError(t("project.none"));
  const e = env ?? found.env;
  return { project: found.project, ...(e ? { env: e } : {}) };
}

/** Wrong arguments: exit code 2 (other failures exit 1) */
class UsageError extends Error {}
const json = () => has("--json");
const err = (msg: string) => process.stderr.write(`${msg}\n`);

async function unlock(): Promise<store.Session> {
  const cached = await remember.recall(store.salt());
  if (cached) {
    try {
      return await store.unlockWithKey(cached);
    } catch {
      await remember.forget();
    }
  }
  return store.unlockWithPassword(await readHidden(t("cli.prompt.password")));
}

async function newPassword(): Promise<string> {
  const a = await readHidden(t("cli.prompt.new"));
  if (!a) throw new Error(t("pw.empty"));
  const b = await readHidden(t("cli.prompt.again"));
  if (a !== b) throw new Error(t("pw.mismatch"));
  return a;
}

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Values in a shell's syntax, for eval or a pipe. Single quotes: nothing in a value is interpreted. */
function formatEnv(values: Record<string, string>, format: string): string {
  const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
  const lines = (f: (k: string, v: string) => string) => entries.map(([k, v]) => f(k, v)).join("\n") + "\n";
  switch (format) {
    case "json":
      return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
    case "pwsh":
      return lines((k, v) => `$env:${k} = '${v.replace(/'/g, "''")}'`);
    case "fish":
      return lines((k, v) => `set -gx ${k} '${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
    case "dotenv":
      return lines((k, v) => `${k}=${JSON.stringify(v)}`);
    default:
      return lines((k, v) => `export ${k}='${v.replace(/'/g, "'\\''")}'`);
  }
}

const commands: Record<string, () => Promise<void>> = {
  async init() {
    const pw = await newPassword();
    await store.create(pw);
    err(t("cli.created", { path: store.VAULT }));
    err(t("cli.noRecovery"));
  },

  async set() {
    const note = flag("--note");
    const env = flag("--env");
    const [p, k] = store.parseRef(args.shift());
    const { key, data } = await unlock();
    const value = process.stdin.isTTY ? await readHidden(t("cli.prompt.value", { ref: `${p}/${k}${env ? ` (${env})` : ""}` })) : await readStdin();
    if (!value) throw new Error(t("cli.valueEmpty"));
    store.setEntry(data, p, k, value, note, env);
    await store.save(key, data);
    err(t("cli.saved", { ref: `${p}/${k}` }));
  },

  async get() {
    const env = flag("--env");
    const show = has("--show");
    const [p, k] = store.parseRef(args.shift());
    if (process.stdout.isTTY && !show) {
      throw new Error(t("cli.noShow"));
    }
    const { data } = await unlock();
    process.stdout.write(store.entryValue(data, p, k, env));
  },

  async copy() {
    const env = flag("--env");
    const [p, k] = store.parseRef(args.shift());
    const { data } = await unlock();
    copyWithClear(store.entryValue(data, p, k, env), 20);
    err(t("cli.copied", { ref: `${p}/${k}` }));
  },

  async ls() {
    const asJson = json();
    const only = args.shift();
    const { data } = await unlock();
    const list = store.listing(data);
    const names = Object.keys(list).filter((p) => !only || p === only).sort();
    if (asJson) {
      // names and notes only — never values
      console.log(JSON.stringify(Object.fromEntries(names.map((p) => [p, list[p]])), null, 2));
      return;
    }
    if (!names.length) {
      err(only ? t("cli.noProject", { name: only }) : t("cli.empty"));
      return;
    }
    for (const p of names) {
      console.log(p);
      for (const e of list[p]) console.log(`  ${e.key}${e.note ? `  — ${e.note}` : ""}`);
    }
  },

  async rm() {
    const env = flag("--env");
    const [p, k] = store.parseRef(args.shift());
    const { key, data } = await unlock();
    store.deleteEntry(data, p, k, env);
    await store.save(key, data);
    err(t("cli.deleted", { ref: `${p}/${k}` }));
  },

  async run() {
    const command = passthrough;
    if (!command.length) throw new UsageError(t("cli.usage.run"));
    const { project, env: environment } = resolveProject();
    const { data } = await unlock();
    const env: NodeJS.ProcessEnv = { ...process.env, ...store.projectValues(data, project, environment) };
    // On Windows a shell is needed to run pnpm.cmd / vercel.cmd, so pass one string, quoting arguments that contain spaces
    const win = process.platform === "win32";
    const q = (a: string) => (/[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
    const child = win
      ? spawn(command.map(q).join(" "), { stdio: "inherit", env, shell: true })
      : spawn(command[0]!, command.slice(1), { stdio: "inherit", env });
    child.on("exit", (code) => process.exit(code ?? 1));
  },

  async import() {
    const p = args.shift();
    const file = args.shift();
    if (!p || !file) throw new UsageError(t("cli.usage.import"));
    const all = Object.entries(parseEnv(fs.readFileSync(file, "utf8")));
    const pairs = all.filter(([, v]) => v !== "");
    const empty = all.filter(([, v]) => v === "").map(([k]) => k);
    const { key, data } = await unlock();
    for (const [k, v] of pairs) store.setEntry(data, p, k, v, t("cli.importedFrom", { file: path.basename(file) }));
    await store.save(key, data);
    err(t("cli.imported", { n: pairs.length, project: p, names: pairs.map(([k]) => k).join(", ") }));
    if (empty.length) err(t("cli.skippedEmpty", { names: empty.join(", ") }));
    err(t("cli.fileStillThere"));
  },

  async "import-passwords"() {
    const del = has("--delete");
    const file = args.shift();
    if (!file) throw new UsageError(t("cli.usage.importPasswords"));
    const { logins, skipped } = readLoginsFile(file);
    const { key, data } = await unlock();
    const { added, duplicates } = store.importLogins(data, logins);
    if (added) await store.save(key, data);
    err(t("cli.importedLogins", { added, duplicates, skipped }));
    if (del) {
      fs.rmSync(file, { force: true });
      err(t("cli.csvDeleted"));
    } else {
      err(t("cli.csvPlain"));
    }
  },

  async unlock() {
    if (!has("--remember")) throw new UsageError(t("cli.usage.unlock"));
    const { key } = await store.unlockWithPassword(await readHidden(t("cli.prompt.password")));
    await remember.remember(key, store.salt());
    err(t("cli.remembered"));
  },

  async forget() {
    await remember.forget();
    err(t("cli.forgotten"));
  },

  async backup() {
    store.readFile();
    const dir = args.shift() || process.env.KV_BACKUP_DIR || path.join(store.HOME, "backups");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = path.join(dir, `vault_${stamp}.kv`);
    fs.copyFileSync(store.VAULT, dest);
    err(t("cli.backedUp", { path: dest }));
  },

  async passwd() {
    const { data } = await store.unlockWithPassword(await readHidden(t("cli.prompt.current")));
    const pw = await newPassword();
    const bak = `${store.VAULT}.before-passwd`;
    fs.copyFileSync(store.VAULT, bak);
    fs.rmSync(store.VAULT);
    try {
      const { key } = await store.create(pw);
      await store.save(key, data);
      fs.rmSync(bak);
    } catch (e) {
      fs.copyFileSync(bak, store.VAULT);
      throw e;
    }
    await remember.forget();
    err(t("cli.passwdChanged"));
  },

  async lang() {
    const l = args.shift();
    if (!l) throw new UsageError(t("cli.usage.lang"));
    saveLang(l);
    err(t("cli.langSet"));
  },

  async env() {
    const format = flag("--format") ?? (process.platform === "win32" && !process.env.SHELL ? "pwsh" : "sh");
    if (!["sh", "pwsh", "fish", "dotenv", "json"].includes(format)) throw new UsageError(t("cli.usage.format", { format }));
    if (process.stdout.isTTY && !has("--show")) throw new Error(t("cli.envNoTty"));
    const { project, env } = resolveProject();
    const { data } = await unlock();
    process.stdout.write(formatEnv(store.projectValues(data, project, env), format));
  },

  async "init-project"() {
    const force = has("--force");
    const env = flag("--env");
    const name = args.find((a) => !a.startsWith("--")) ?? suggestName();
    if (name.includes("/")) throw new UsageError(t("ref.invalid", { ref: name }));
    const file = writeProject(process.cwd(), { project: name, ...(env ? { env } : {}) }, force);
    err(t("cli.projectCreated", { path: file, name }));
  },

  async example() {
    const { project } = resolveProject();
    const { data } = await unlock();
    const keys = data.projects[project];
    if (!keys) throw new Error(t("cli.noProject", { name: project }));
    process.stdout.write(Object.keys(keys).sort().map((k) => `${k}=`).join("\n") + "\n");
  },

  async check() {
    const file = flag("--file") ?? ".env.example"; // before resolveProject, so its value is not taken as the project
    const { project, env } = resolveProject();
    const wanted = Object.keys(parseEnv(fs.readFileSync(file, "utf8")));
    const { data } = await unlock();
    const have = store.projectValues(data, project, env);
    const missing = wanted.filter((k) => !(k in have));
    if (missing.length) throw new Error(t("cli.checkMissing", { project, env: env ? `, ${env}` : "", names: missing.join(", ") }));
    err(t("cli.checkOk", { n: wanted.length, file, project }));
  },

  async mv() {
    const from = args.shift();
    const to = args.shift();
    if (!from || !to) throw new UsageError(t("cli.usage.mv"));
    const { key, data } = await unlock();
    if (from.includes("/") || to.includes("/")) store.renameEntry(data, store.parseRef(from), store.parseRef(to));
    else store.renameProject(data, from, to);
    await store.save(key, data);
    err(t("cli.moved", { from, to }));
  },

  async status() {
    const asJson = json();
    const s = { version: pkg.version, vault: store.VAULT, exists: store.exists(), remembered: remember.remembered(), lang: getLang() };
    if (asJson) return console.log(JSON.stringify(s, null, 2));
    console.log(`kv-vault ${s.version}
${t("cli.status.vault")}: ${s.vault}${s.exists ? "" : ` (${t("cli.status.none")})`}
${t("cli.status.remembered")}: ${s.remembered ? t("cli.status.yes") : t("cli.status.no")}
${t("cli.status.lang")}: ${s.lang}`);
  },

  async completion() {
    const shell = args.shift() as Shell | undefined;
    if (!shell || !SHELLS.includes(shell)) throw new UsageError(t("cli.usage.completion"));
    process.stdout.write(completion(shell));
  },

  async ui() {
    const { startUi } = await import("./ui-server.ts");
    await startUi(await unlock());
  },
};

try {
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    console.log(pkg.version);
  } else if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(t("cli.help", { vault: store.VAULT }));
  } else if (!Object.hasOwn(commands, cmd)) {
    // hasOwn: "toString" or "constructor" are not commands
    throw new UsageError(t("cli.unknownCommand", { cmd }));
  } else {
    await commands[cmd]!();
  }
} catch (e) {
  err(`kv: ${(e as Error).message}`);
  process.exit(e instanceof UsageError ? 2 : 1);
}
