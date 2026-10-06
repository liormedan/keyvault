// Moving a project's keys to and from hosting platforms through their own CLIs (vercel, gh).
// Values only ever travel on the CLI's stdin — never as arguments, never into logs. Everything passed
// as an argument is a validated name, so running through a shell on Windows (for .cmd shims) is safe.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { t } from "./i18n.ts";

export const PLATFORMS = ["vercel", "github"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type VercelTarget = "production" | "preview" | "development";

export interface ToolResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
/** How a platform CLI is run — swapped for a fake in tests */
export type Runner = (cmd: string, args: string[], opts: { input?: string; cwd?: string }) => ToolResult;

const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// names, targets, repo names — and our own temp-file paths (drive letters, backslashes, spaces in a user folder)
const SAFE_ARG = /^[A-Za-z0-9._\/:\\ ()-]+$/;
const WINDOWS = process.platform === "win32";

export const runTool: Runner = (cmd, args, { input, cwd }) => {
  for (const a of args) if (!SAFE_ARG.test(a)) throw new Error(t("push.unsafeArg", { arg: a }));
  // Windows needs a shell to run vercel.cmd / gh shims; quote what has spaces (nothing else in SAFE_ARG is special to cmd)
  const argv = WINDOWS ? args.map((a) => (/[ ()]/.test(a) ? `"${a}"` : a)) : args;
  const r = spawnSync(cmd, argv, { input, cwd, encoding: "utf8", shell: WINDOWS, windowsHide: true });
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(t("push.noTool", { tool: cmd }));
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** kv environment → Vercel target: prod → production, staging/preview → preview, anything else → development */
export function vercelTarget(env: string | undefined, explicit?: string): VercelTarget {
  if (explicit) {
    if (explicit !== "production" && explicit !== "preview" && explicit !== "development") throw new Error(t("push.badTarget", { target: explicit }));
    return explicit;
  }
  if (env === "prod" || env === "production") return "production";
  if (env === "staging" || env === "preview") return "preview";
  return "development";
}

function checkNames(values: Record<string, string>): void {
  for (const k of Object.keys(values)) if (!SAFE_NAME.test(k)) throw new Error(t("push.badName", { name: k }));
}

function fail(tool: string, r: ToolResult, name?: string): never {
  // the CLI's own message, without anything we sent on stdin
  const msg = (r.stderr || r.stdout).trim().split(/\r?\n/).slice(-3).join(" ");
  throw new Error(t("push.failed", { tool, name: name ?? "", reason: msg || `exit ${r.status}` }));
}

export interface PushOptions {
  target?: VercelTarget;
  sensitive?: boolean;
  repo?: string;
  environment?: string;
  cwd?: string;
}

/** Push every value; returns the names, in order */
export function push(platform: Platform, values: Record<string, string>, opts: PushOptions, run: Runner = runTool): string[] {
  checkNames(values);
  const names = Object.keys(values).sort();
  for (const name of names) {
    const input = values[name]!;
    if (platform === "vercel") {
      const args = ["env", "add", name, opts.target ?? "development", "--force", ...(opts.sensitive ? ["--sensitive"] : [])];
      const r = run("vercel", args, { input, cwd: opts.cwd });
      if (r.status !== 0) fail("vercel", r, name);
    } else {
      const args = ["secret", "set", name, ...(opts.repo ? ["--repo", opts.repo] : []), ...(opts.environment ? ["--env", opts.environment] : [])];
      const r = run("gh", args, { input, cwd: opts.cwd });
      if (r.status !== 0) fail("gh", r, name);
    }
  }
  return names;
}

/** Vercel's values for a target, through `vercel env pull` into a private temp file that is deleted at once */
export function pullVercel(target: VercelTarget, cwd: string | undefined, parseEnv: (text: string) => Record<string, string>, run: Runner = runTool): Record<string, string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kv-pull-"));
  const file = path.join(dir, "vercel.env");
  try {
    const r = run("vercel", ["env", "pull", file, "--environment", target, "--yes"], { cwd });
    if (r.status !== 0) fail("vercel", r);
    const values = parseEnv(fs.readFileSync(file, "utf8"));
    // vercel adds its own variables to every pull
    for (const k of Object.keys(values)) if (k.startsWith("VERCEL_") || k === "TURBO_CACHE") delete values[k];
    return values;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** GitHub secrets can't be read back — names only */
export function githubSecretNames(opts: { repo?: string; environment?: string; cwd?: string }, run: Runner = runTool): string[] {
  const r = run("gh", ["secret", "list", "--json", "name", ...(opts.repo ? ["--repo", opts.repo] : []), ...(opts.environment ? ["--env", opts.environment] : [])], { cwd: opts.cwd });
  if (r.status !== 0) fail("gh", r);
  return (JSON.parse(r.stdout || "[]") as { name: string }[]).map((s) => s.name).sort();
}

export interface Diff {
  onlyVault: string[];
  onlyPlatform: string[];
  /** same name, different value — only knowable where the platform lets us read values (Vercel) */
  changed: string[];
  same: number;
}

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

/** Compare by name, and by value hash where the platform's values are known. Never returns values. */
export function diff(vault: Record<string, string>, platformNames: string[], platformValues?: Record<string, string>): Diff {
  const out: Diff = { onlyVault: [], onlyPlatform: [], changed: [], same: 0 };
  const theirs = new Set(platformNames);
  for (const k of Object.keys(vault).sort()) {
    if (!theirs.has(k)) out.onlyVault.push(k);
    else if (platformValues && sha(platformValues[k] ?? "") !== sha(vault[k]!)) out.changed.push(k);
    else out.same++;
  }
  out.onlyPlatform = platformNames.filter((k) => !(k in vault)).sort();
  return out;
}
