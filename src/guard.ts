// kv guard — the vault knows your secrets, so it can see them about to be committed.
// Looks for every stored value (dev keys in all environments, secret item fields) in the lines a commit
// adds, and reports file, line and key name. Values never leave memory and are never printed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { t } from "./i18n.ts";
import type { VaultData } from "./model.ts";
import { readSmallFile } from "./scan.ts";
import { TYPES } from "./types.ts";

/** Shorter values ("true", "8080", "dev") would match everywhere — they can't be secrets worth guarding */
export const MIN_LENGTH = 8;

export interface Finding {
  file: string;
  line: number;
  /** project/KEY, project/KEY (env), or the item's title / field label */
  name: string;
}

/** Every value worth guarding, with a name to report instead of the value */
export function secretsOf(data: VaultData): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  const add = (name: string, value: string | undefined) => {
    if (value && value.length >= MIN_LENGTH) out.push({ name, value });
  };
  for (const [p, keys] of Object.entries(data.projects)) {
    for (const [k, e] of Object.entries(keys)) {
      add(`${p}/${k}`, e.value);
      for (const [env, v] of Object.entries(e.envs ?? {})) add(`${p}/${k} (${env})`, v.value);
    }
  }
  for (const it of Object.values(data.items)) {
    for (const f of TYPES[it.type]?.fields ?? []) if (f.secret) add(`${it.title} · ${f.label.en}`, it.fields[f.k]);
  }
  return out;
}

/** Added lines of a unified diff (`git diff -U0`), with their file and line number in the new version */
export function addedLines(diff: string): { file: string; line: number; text: string }[] {
  const out: { file: string; line: number; text: string }[] = [];
  let file = "";
  let next = 0;
  for (const raw of diff.split("\n")) {
    const l = raw.replace(/\r$/, "");
    if (l.startsWith("+++ ")) file = l.slice(4).replace(/^b\//, "");
    else if (l.startsWith("@@")) next = Number(/\+(\d+)/.exec(l)?.[1] ?? 0);
    else if (l.startsWith("+") && file !== "/dev/null") out.push({ file, line: next++, text: l.slice(1) });
    else if (!l.startsWith("-") && !l.startsWith("\\")) next++;
  }
  return out;
}

export function findLeaks(data: VaultData, lines: { file: string; line: number; text: string }[]): Finding[] {
  const secrets = secretsOf(data);
  const out: Finding[] = [];
  for (const l of lines) for (const s of secrets) if (l.text.includes(s.value)) out.push({ file: l.file, line: l.line, name: s.name });
  return out;
}

const git = (args: string[], cwd?: string) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] });

/** What `git commit` is about to add */
export function stagedLines(cwd?: string) {
  return addedLines(git(["diff", "--cached", "-U0", "--no-color", "--no-ext-diff"], cwd));
}

/** Every line of every tracked file (`kv guard --all`, a one-off sweep of a repository) */
export function trackedLines(cwd?: string) {
  const root = git(["rev-parse", "--show-toplevel"], cwd).trim();
  const out: { file: string; line: number; text: string }[] = [];
  for (const f of git(["ls-files", "-z"], root).split("\0").filter(Boolean)) {
    const p = path.join(root, f);
    let text: string | null;
    try {
      text = readSmallFile(p, 2 << 20);
    } catch {
      continue;
    }
    if (text === null) continue;
    if (text.includes("\0")) continue; // binary
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) out.push({ file: f, line: i + 1, text: lines[i]! });
  }
  return out;
}

// ── pre-commit hook ──

const MARK = "# kv-vault guard";
const HOOK = `#!/bin/sh\n${MARK} — blocks commits that contain a value from your vault (remove this file to stop)\nkv guard || exit 1\n`;

function hookPath(cwd?: string): string {
  const dir = git(["rev-parse", "--git-path", "hooks"], cwd).trim();
  return path.resolve(cwd ?? process.cwd(), dir, "pre-commit");
}

export function installHook(cwd?: string, force = false): string {
  const p = hookPath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // one handle from check to write: create if absent ("wx"), else open, read and overwrite the same file
  let fd: number;
  try {
    fd = fs.openSync(p, "wx", 0o755);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    fd = fs.openSync(p, "r+");
    const current = fs.readFileSync(fd, "utf8");
    if (!current.includes(MARK) && !force) {
      fs.closeSync(fd);
      throw new Error(t("guard.hookExists", { path: p }));
    }
    fs.ftruncateSync(fd, 0);
  }
  try {
    fs.writeSync(fd, HOOK, 0);
  } finally {
    fs.closeSync(fd);
  }
  return p;
}

export function uninstallHook(cwd?: string): string | null {
  const p = hookPath(cwd);
  if (!fs.existsSync(p) || !fs.readFileSync(p, "utf8").includes(MARK)) return null;
  fs.rmSync(p);
  return p;
}

export const hookInstalled = (cwd?: string): boolean => {
  try {
    const p = hookPath(cwd);
    return fs.existsSync(p) && fs.readFileSync(p, "utf8").includes(MARK);
  } catch {
    return false;
  }
};
