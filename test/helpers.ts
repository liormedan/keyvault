// Shared by the test files: run the backend or the CLI as a child process against a temporary vault.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { after } from "node:test";
import { fileURLToPath } from "node:url";

// The backend and CLI import .ts modules; Node runs them with type stripping
const NODE_TS = ["--experimental-strip-types", "--no-warnings=ExperimentalWarning"];
const BACKEND = fileURLToPath(new URL("../src/backend.ts", import.meta.url));
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

/** A raw reply, loosely typed on purpose: tests also send invalid requests. `error` is undefined on success. */
export type TestReply = { id: number | null; result?: any; error: string };

/** A backend process that stays up; `call` sends one request and waits for its reply */
export function startBackend(home: string) {
  const child = spawn(process.execPath, [...NODE_TS, BACKEND], { env: { ...process.env, KV_HOME: home }, stdio: ["pipe", "pipe", "pipe"] });
  after(() => child.kill()); // a failed assertion must not leave the process (and the test run) hanging
  let stderr = "";
  child.stderr.on("data", (c: Buffer) => (stderr += c));
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const call = async (method: string, params?: unknown): Promise<TestReply> => {
    child.stdin.write(`${JSON.stringify({ id: ++id, method, params })}\n`);
    const { value } = await lines.next();
    const res = JSON.parse(value as string) as TestReply;
    assert.equal(res.id, id);
    return res;
  };
  return { call, stop: () => child.stdin.end(), stderr: () => stderr };
}

/** Write all requests and close stdin at once, then collect every reply until the backend exits */
export function runBackendBatch(home: string, requests: { id: number; method: string; params?: unknown }[]): Promise<TestReply[]> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...NODE_TS, BACKEND], { env: { ...process.env, KV_HOME: home }, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c));
    child.on("exit", () => resolve(out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as TestReply)));
    child.stdin.end(requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
  });
}

/** Run `kv <args>`; resolves with stdout and stderr together */
export function runCli(home: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [...NODE_TS, CLI, ...args], { env: { ...process.env, KV_HOME: home, KV_LANG: "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", (d: Buffer) => (out += d));
    c.stderr.on("data", (d: Buffer) => (out += d));
    c.on("exit", () => resolve(out));
  });
}

/** Like runCli, but also the exit code, and stdout separately (for --json) */
export function runCliFull(home: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [...NODE_TS, CLI, ...args], { env: { ...process.env, KV_HOME: home, KV_LANG: "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    c.stdout.on("data", (d: Buffer) => (stdout += d));
    c.stderr.on("data", (d: Buffer) => (stderr += d));
    c.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}
