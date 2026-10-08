import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

// Temporary vault and a fake registry — never the real ones. The clipboard calls (copy, copyGenerated) are not
// exercised here: local tests never touch the user's clipboard.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "kv-browser-"));
process.env.KV_HOME = HOME;
const store = await import("../src/store.ts");
const setup = await import("../src/browser-setup.ts");
const { CHROME_ID, FIREFOX_ID, HOST_NAME } = await import("../src/browser-ids.ts");
const { Decoder, encode } = await import("../src/native-messaging.ts");
const PW = "browser test password";
const HOST = fileURLToPath(new URL("../src/host.ts", import.meta.url));
const ORIGIN = `chrome-extension://${CHROME_ID}/`;

const config = (o: Record<string, unknown>) => fs.writeFileSync(path.join(HOME, "config.json"), JSON.stringify(o));

/** The host as the browser starts it: framed JSON on stdin/stdout, the caller's origin as an argument */
function startHost(args: string[] = [ORIGIN]) {
  const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings=ExperimentalWarning", HOST, ...args], {
    env: { ...process.env, KV_HOME: HOME },
    stdio: ["pipe", "pipe", "pipe"],
  });
  after(() => child.kill());
  let stderr = "";
  child.stderr.on("data", (c: Buffer) => (stderr += c));
  const decoder = new Decoder();
  const replies: Record<string, unknown>[] = [];
  const waiting: ((r: Record<string, unknown>) => void)[] = [];
  child.stdout.on("data", (c: Buffer) => {
    for (const m of decoder.push(c)) {
      const w = waiting.shift();
      if (w) w(m as Record<string, unknown>);
      else replies.push(m as Record<string, unknown>);
    }
  });
  let id = 0;
  // biome-ignore lint/suspicious/noExplicitAny: replies are read loosely in tests
  const call = (method: string, params: Record<string, unknown> = {}): Promise<{ result?: any; error?: string }> => {
    child.stdin.write(encode({ id: ++id, method, params }));
    return new Promise((resolve) => waiting.push(resolve as (r: Record<string, unknown>) => void));
  };
  const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
  return { call, stop: () => child.stdin.end(), exited, stderr: () => stderr, stdoutBytes: () => replies.length };
}

test("host: refuses any caller but the kv-vault extension", async () => {
  const h = startHost(["chrome-extension://someoneelse/"]);
  assert.equal(await h.exited, 1);
  const none = startHost([]);
  assert.equal(await none.exited, 1);
});

test("host: off until the user turns it on; status still answers", async () => {
  const { key, data } = await store.create(PW);
  store.saveItem(data, {
    type: "login",
    title: "GitHub",
    fields: { url: "https://github.com/login", username: "dana", password: "gh-secret-1", totp: "JBSWY3DPEHPK3PXP" },
  });
  store.saveItem(data, { type: "login", title: "Bank", fields: { url: "https://www.bank.co.il", username: "dana", password: "bank-secret-2" } });
  store.saveItem(data, { type: "card", title: "Visa", fields: { number: "4111111111111111" } });
  await store.save(key, data);
  const h = startHost();
  const st = await h.call("status");
  assert.deepEqual({ ...st.result, lang: undefined }, { exists: true, enabled: false, unlocked: false, remembered: false, lang: undefined });
  assert.equal((await h.call("unlock", { password: PW })).error, "disabled");
  assert.equal((await h.call("logins", { url: "https://github.com/" })).error, "disabled");
  h.stop();
  assert.equal(await h.exited, 0);
});

test("host: unlock, logins for this site only, fill re-checks the site, nothing secret on stderr", async () => {
  config({ browser: true });
  const h = startHost();
  assert.equal((await h.call("logins", { url: "https://github.com/" })).error, "locked");
  assert.equal((await h.call("unlock")).error, "locked", "no remembered key in the temp folder");
  assert.equal((await h.call("unlock", { password: "wrong password!!" })).error, "wrong-password");
  assert.deepEqual((await h.call("unlock", { password: PW })).result, { ok: true });

  const gh = await h.call("logins", { url: "https://github.com/login?return_to=x" });
  assert.equal(gh.result.host, "github.com");
  assert.deepEqual(
    gh.result.logins.map((l: { title: string; username: string; totp: boolean }) => [l.title, l.username, l.totp]),
    [["GitHub", "dana", true]],
  );
  assert.ok(!JSON.stringify(gh).includes("gh-secret-1"), "the list carries no passwords");
  assert.deepEqual((await h.call("logins", { url: "https://github.com.evil.example/" })).result.logins, []);
  assert.deepEqual((await h.call("logins", { url: "https://other.co.il/" })).result.logins, []);

  const id = gh.result.logins[0].id;
  assert.deepEqual((await h.call("fill", { id, url: "https://github.com/login" })).result, { username: "dana", password: "gh-secret-1" });
  assert.equal((await h.call("fill", { id, url: "https://evil.example/" })).error, "not-found", "a login never fills on another site");
  assert.equal((await h.call("fill", { id: "nope", url: "https://github.com/" })).error, "not-found");
  assert.equal((await h.call("nope")).error, "unknown");
  h.stop();
  assert.equal(await h.exited, 0);
  assert.ok(!/gh-secret|bank-secret|browser test password/.test(h.stderr()));
});

test("host: save offers — same, update, new — and saves without losing other changes", async () => {
  const h = startHost();
  await h.call("unlock", { password: PW });
  const base = { url: "https://github.com/session", username: "Dana" };
  assert.deepEqual((await h.call("check", { ...base, password: "gh-secret-1" })).result, { status: "same" });
  const upd = (await h.call("check", { ...base, password: "gh-new-3" })).result;
  assert.equal(upd.status, "update");
  assert.equal(upd.title, "GitHub");
  assert.deepEqual((await h.call("check", { url: "https://gitlab.com/users/sign_in", username: "dana", password: "x-4" })).result, { status: "new" });

  // Meanwhile the desktop app adds an item: the host's save must keep it
  const s = await store.unlockWithPassword(PW);
  store.saveItem(s.data, { type: "note", title: "Added in the app", fields: { body: "x" } });
  await store.save(s.key, s.data);

  assert.deepEqual((await h.call("save", { ...base, password: "gh-new-3" })).result.updated, true);
  const added = (await h.call("save", { url: "https://gitlab.com/users/sign_in", username: "dana", password: "gl-secret-5", title: "Sign in · GitLab" }))
    .result;
  assert.equal(added.updated, false);
  assert.equal((await h.call("save", { url: "javascript:void(0)", username: "x", password: "y" })).error, "invalid");
  h.stop();
  await h.exited;

  const after = await store.unlockWithPassword(PW);
  const items = Object.values(after.data.items);
  assert.ok(
    items.some((i) => i.title === "Added in the app"),
    "a change made meanwhile survives",
  );
  assert.equal(items.find((i) => i.title === "GitHub")!.fields.password, "gh-new-3");
  assert.equal(items.find((i) => i.title === "GitHub")!.fields.totp, "JBSWY3DPEHPK3PXP", "update keeps the other fields");
  const gl = items.find((i) => i.id === added.id)!;
  assert.deepEqual(gl.fields, { url: "https://gitlab.com", username: "dana", password: "gl-secret-5" });
  assert.equal(gl.title, "Sign in · GitLab");
});

test("registration on Windows: manifests, launcher, and registry values through the injected runner", () => {
  const calls: string[][] = [];
  const registered = new Set<string>();
  const reg = (args: string[]) => {
    calls.push(args);
    if (args[0] === "add") registered.add(args[1]!);
    if (args[0] === "delete") registered.delete(args[1]!);
    return args[0] === "query" ? (registered.has(args[1]!) ? 0 : 1) : 0;
  };
  const env = { hostScript: "C:\\Program Files\\kv vault\\host.mjs", node: "C:\\node\\node.exe", platform: "win32" as const, reg, home: HOME };
  assert.deepEqual(setup.browserStatus(env).registered, []);
  const st = setup.enableBrowser(env);
  assert.equal(st.enabled, true);
  assert.deepEqual(st.registered, ["Chrome", "Edge", "Chromium", "Firefox"]);
  const chromium = JSON.parse(fs.readFileSync(path.join(setup.HOST_DIR, `${HOST_NAME}.chromium.json`), "utf8"));
  assert.deepEqual(chromium.allowed_origins, [`chrome-extension://${CHROME_ID}/`]);
  assert.equal(chromium.type, "stdio");
  const firefox = JSON.parse(fs.readFileSync(path.join(setup.HOST_DIR, `${HOST_NAME}.firefox.json`), "utf8"));
  assert.deepEqual(firefox.allowed_extensions, [FIREFOX_ID]);
  const bat = fs.readFileSync(chromium.path, "utf8");
  assert.match(bat, /^@echo off\r\nchcp 65001 >nul\r\n"C:\\node\\node.exe" "C:\\Program Files\\kv vault\\host.mjs" %\*\r\n$/);
  const chromeAdd = calls.find((c) => c[0] === "add" && c[1]!.includes("Google\\Chrome"))!;
  assert.deepEqual(chromeAdd.slice(2), ["/ve", "/t", "REG_SZ", "/d", path.join(setup.HOST_DIR, `${HOST_NAME}.chromium.json`), "/f"]);
  assert.ok(calls.find((c) => c[0] === "add" && c[1]!.includes("Mozilla"))![6]!.endsWith(".firefox.json"));

  const off = setup.disableBrowser(env);
  assert.equal(off.enabled, false);
  assert.deepEqual(off.registered, []);
  assert.ok(!fs.existsSync(setup.HOST_DIR));
});

test("registration on Linux: only browsers that are installed get a manifest", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "kv-browser-home-"));
  fs.mkdirSync(path.join(home, ".config", "google-chrome"), { recursive: true });
  fs.mkdirSync(path.join(home, ".mozilla"), { recursive: true });
  const env = { hostScript: "/opt/kv/host.js", node: "/usr/bin/node", platform: "linux" as const, home };
  const st = setup.enableBrowser(env);
  assert.deepEqual(st.registered, ["Chrome", "Firefox"]);
  assert.ok(!fs.existsSync(path.join(home, ".config", "microsoft-edge")), "no folders made for browsers that aren't there");
  const m = JSON.parse(fs.readFileSync(path.join(home, ".config/google-chrome/NativeMessagingHosts", `${HOST_NAME}.json`), "utf8"));
  assert.equal(fs.readFileSync(m.path, "utf8"), "#!/bin/sh\nexec '/usr/bin/node' '/opt/kv/host.js' \"$@\"\n");
  assert.deepEqual(setup.disableBrowser(env).registered, []);
});
