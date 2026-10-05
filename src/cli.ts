#!/usr/bin/env node
// kv — a local, encrypted vault for development keys.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as dpapi from "./dpapi.ts";
import { saveLang, t } from "./i18n.ts";
import { readLoginsFile } from "./import-csv.ts";
import { copyWithClear, readHidden, readStdin } from "./io.ts";
import * as store from "./store.ts";

const args = process.argv.slice(2);
const cmd = args.shift();
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
const err = (msg: string) => process.stderr.write(`${msg}\n`);

async function unlock(): Promise<store.Session> {
  const cached = dpapi.recall(store.salt());
  if (cached) {
    try {
      return await store.unlockWithKey(cached);
    } catch {
      dpapi.forget();
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

const commands: Record<string, () => Promise<void>> = {
  async init() {
    const pw = await newPassword();
    await store.create(pw);
    err(t("cli.created", { path: store.VAULT }));
    err(t("cli.noRecovery"));
  },

  async set() {
    const [p, k] = store.parseRef(args.shift());
    const note = flag("--note");
    const { key, data } = await unlock();
    const value = process.stdin.isTTY ? await readHidden(t("cli.prompt.value", { ref: `${p}/${k}` })) : await readStdin();
    if (!value) throw new Error(t("cli.valueEmpty"));
    store.setEntry(data, p, k, value, note);
    await store.save(key, data);
    err(t("cli.saved", { ref: `${p}/${k}` }));
  },

  async get() {
    const [p, k] = store.parseRef(args.shift());
    if (process.stdout.isTTY && !has("--show")) {
      throw new Error(t("cli.noShow"));
    }
    const { data } = await unlock();
    process.stdout.write(store.getEntry(data, p, k).value);
  },

  async copy() {
    const [p, k] = store.parseRef(args.shift());
    const { data } = await unlock();
    copyWithClear(store.getEntry(data, p, k).value, 20);
    err(t("cli.copied", { ref: `${p}/${k}` }));
  },

  async ls() {
    const only = args.shift();
    const { data } = await unlock();
    const list = store.listing(data);
    const names = Object.keys(list).filter((p) => !only || p === only).sort();
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
    const [p, k] = store.parseRef(args.shift());
    const { key, data } = await unlock();
    store.deleteEntry(data, p, k);
    await store.save(key, data);
    err(t("cli.deleted", { ref: `${p}/${k}` }));
  },

  async run() {
    const p = args.shift();
    const sep = args.indexOf("--");
    const command = sep >= 0 ? args.slice(sep + 1) : args;
    if (!p || !command.length) throw new Error(t("cli.usage.run"));
    const { data } = await unlock();
    const keys = data.projects[p];
    if (!keys) throw new Error(t("cli.noProject", { name: p }));
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [k, e] of Object.entries(keys)) env[k] = e.value;
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
    if (!p || !file) throw new Error(t("cli.usage.import"));
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
    if (!file) throw new Error(t("cli.usage.importPasswords"));
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
    if (!has("--remember")) throw new Error(t("cli.usage.unlock"));
    const { key } = await store.unlockWithPassword(await readHidden(t("cli.prompt.password")));
    dpapi.remember(key, store.salt());
    err(t("cli.remembered"));
  },

  async forget() {
    dpapi.forget();
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
    dpapi.forget();
    err(t("cli.passwdChanged"));
  },

  async lang() {
    const l = args.shift();
    if (!l) throw new Error(t("cli.usage.lang"));
    saveLang(l);
    err(t("cli.langSet"));
  },

  async ui() {
    const { startUi } = await import("./ui-server.ts");
    await startUi(await unlock());
  },
};

try {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(t("cli.help", { vault: store.VAULT }));
  } else if (!Object.hasOwn(commands, cmd)) {
    // hasOwn: "toString" or "constructor" are not commands
    throw new Error(t("cli.unknownCommand", { cmd }));
  } else {
    await commands[cmd]!();
  }
} catch (e) {
  err(`kv: ${(e as Error).message}`);
  process.exit(1);
}
