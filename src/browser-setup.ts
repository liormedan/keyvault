// Connect the browser extension to this computer: register kv-vault's native messaging host with Chrome, Edge,
// Chromium and Firefox, and keep the user's on/off choice. Off by default — nothing is registered until the user
// turns it on (the desktop app's "Browser extension" dialog, or `kv browser enable`).
//
// Files live in ~/.keyvault/native-host/: a launcher (Windows: .bat, elsewhere: sh) that runs `node host.mjs`, and a
// manifest per browser family. Windows finds the manifest through a registry value under HKCU; macOS and Linux
// through a copy in each installed browser's NativeMessagingHosts folder. `reg` runs through an injectable runner,
// so tests never touch the real registry.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHROME_ID, FIREFOX_ID, HOST_NAME } from "./browser-ids.ts";
import { HOME } from "./store.ts";

const CONFIG = path.join(HOME, "config.json");
export const HOST_DIR = path.join(HOME, "native-host");

export type Family = "chromium" | "firefox";

interface Target {
  name: string;
  family: Family;
  /** Windows: the registry key whose default value is the manifest path */
  reg: string;
  /** macOS / Linux: the browser's config folder (registered only if it exists) and its hosts folder */
  dir: Record<"darwin" | "linux", { profile: string; hosts: string }>;
}

const lib = (home: string, p: string) => path.join(home, "Library", "Application Support", p);
const conf = (home: string, p: string) => path.join(home, ".config", p);

function targets(home: string): Target[] {
  return [
    {
      name: "Chrome",
      family: "chromium",
      reg: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
      dir: {
        darwin: { profile: lib(home, "Google/Chrome"), hosts: lib(home, "Google/Chrome/NativeMessagingHosts") },
        linux: { profile: conf(home, "google-chrome"), hosts: conf(home, "google-chrome/NativeMessagingHosts") },
      },
    },
    {
      name: "Edge",
      family: "chromium",
      reg: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
      dir: {
        darwin: { profile: lib(home, "Microsoft Edge"), hosts: lib(home, "Microsoft Edge/NativeMessagingHosts") },
        linux: { profile: conf(home, "microsoft-edge"), hosts: conf(home, "microsoft-edge/NativeMessagingHosts") },
      },
    },
    {
      name: "Chromium",
      family: "chromium",
      reg: `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`,
      dir: {
        darwin: { profile: lib(home, "Chromium"), hosts: lib(home, "Chromium/NativeMessagingHosts") },
        linux: { profile: conf(home, "chromium"), hosts: conf(home, "chromium/NativeMessagingHosts") },
      },
    },
    {
      name: "Firefox",
      family: "firefox",
      reg: `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`,
      dir: {
        darwin: { profile: lib(home, "Mozilla"), hosts: lib(home, "Mozilla/NativeMessagingHosts") },
        linux: { profile: path.join(home, ".mozilla"), hosts: path.join(home, ".mozilla/native-messaging-hosts") },
      },
    },
  ];
}

// ── The on/off choice (config.json, next to the language) ──

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const browserEnabled = (): boolean => readConfig().browser === true;

function setEnabled(on: boolean): void {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ ...readConfig(), browser: on }, null, 1));
}

// ── Registration ──

/** Runs `reg` with arguments; returns the exit code. Injected in tests. */
export type RegRunner = (args: string[]) => number;
const realReg: RegRunner = (args) => spawnSync("reg", args, { stdio: "ignore", windowsHide: true }).status ?? 1;

export interface SetupEnv {
  /** the host script (host.mjs next to the backend, or host.js next to the CLI) */
  hostScript: string;
  node?: string;
  home?: string;
  platform?: NodeJS.Platform;
  reg?: RegRunner;
}

export function manifest(family: Family, launcher: string): Record<string, unknown> {
  const base = { name: HOST_NAME, description: "kv-vault — fills logins from your local vault", path: launcher, type: "stdio" };
  return family === "firefox" ? { ...base, allowed_extensions: [FIREFOX_ID] } : { ...base, allowed_origins: [`chrome-extension://${CHROME_ID}/`] };
}

function writeLauncher(env: SetupEnv, platform: NodeJS.Platform): string {
  fs.mkdirSync(HOST_DIR, { recursive: true });
  const node = env.node ?? process.execPath;
  if (platform === "win32") {
    // chcp 65001: paths are written as UTF-8, so a non-English user name still works. %% escapes a literal %.
    const q = (p: string) => `"${p.replace(/%/g, "%%")}"`;
    const file = path.join(HOST_DIR, "kv-vault-host.bat");
    fs.writeFileSync(file, `@echo off\r\nchcp 65001 >nul\r\n${q(node)} ${q(env.hostScript)} %*\r\n`);
    return file;
  }
  const q = (p: string) => `'${p.replace(/'/g, "'\\''")}'`;
  const file = path.join(HOST_DIR, "kv-vault-host.sh");
  fs.writeFileSync(file, `#!/bin/sh\nexec ${q(node)} ${q(env.hostScript)} "$@"\n`, { mode: 0o755 });
  fs.chmodSync(file, 0o755);
  return file;
}

// ── What ships next to this bundle ──
// backend.mjs (installer) has host.mjs and extension/ beside it; dist/cli.js (npm) has host.js and extension/.
// Running from source (tests, `tauri dev` without a build) falls back to the build in dist/.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const firstExisting = (paths: string[]): string | null => paths.find((p) => fs.existsSync(p)) ?? null;

export const bundledHost = (): string | null =>
  firstExisting([path.join(HERE, "host.mjs"), path.join(HERE, "host.js"), path.join(HERE, "..", "dist", "host.js")]);

export const bundledExtension = (target: "chrome" | "firefox"): string | null =>
  firstExisting(
    [path.join(HERE, "extension", target), path.join(HERE, "..", "dist", "extension", target)].filter((d) => fs.existsSync(path.join(d, "manifest.json"))),
  );

export interface BrowserStatus {
  enabled: boolean;
  /** browsers the host is registered with */
  registered: string[];
  chromeId: string;
  firefoxId: string;
  /** where to "Load unpacked" from, until the extension is in the stores */
  chromeExtension: string | null;
  firefoxExtension: string | null;
}

export function enableBrowser(env: SetupEnv): BrowserStatus {
  const platform = env.platform ?? process.platform;
  const home = env.home ?? os.homedir();
  const reg = env.reg ?? realReg;
  const launcher = writeLauncher(env, platform);
  for (const family of ["chromium", "firefox"] as const) {
    fs.writeFileSync(path.join(HOST_DIR, `${HOST_NAME}.${family}.json`), JSON.stringify(manifest(family, launcher), null, 2));
  }
  for (const tg of targets(home)) {
    const file = path.join(HOST_DIR, `${HOST_NAME}.${tg.family}.json`);
    if (platform === "win32") reg(["add", tg.reg, "/ve", "/t", "REG_SZ", "/d", file, "/f"]);
    else if (platform === "darwin" || platform === "linux") {
      const d = tg.dir[platform];
      if (!fs.existsSync(d.profile)) continue; // that browser isn't installed
      fs.mkdirSync(d.hosts, { recursive: true });
      fs.copyFileSync(file, path.join(d.hosts, `${HOST_NAME}.json`));
    }
  }
  setEnabled(true);
  return browserStatus(env);
}

export function disableBrowser(env: Omit<SetupEnv, "hostScript"> = {}): BrowserStatus {
  const platform = env.platform ?? process.platform;
  const home = env.home ?? os.homedir();
  const reg = env.reg ?? realReg;
  for (const tg of targets(home)) {
    if (platform === "win32") reg(["delete", tg.reg, "/f"]);
    else if (platform === "darwin" || platform === "linux") fs.rmSync(path.join(tg.dir[platform].hosts, `${HOST_NAME}.json`), { force: true });
  }
  fs.rmSync(HOST_DIR, { recursive: true, force: true });
  setEnabled(false);
  return browserStatus(env);
}

export function browserStatus(env: Omit<SetupEnv, "hostScript"> = {}): BrowserStatus {
  const platform = env.platform ?? process.platform;
  const home = env.home ?? os.homedir();
  const reg = env.reg ?? realReg;
  const registered = targets(home)
    .filter((tg) =>
      platform === "win32"
        ? reg(["query", tg.reg, "/ve"]) === 0
        : platform === "darwin" || platform === "linux"
          ? fs.existsSync(path.join(tg.dir[platform].hosts, `${HOST_NAME}.json`))
          : false,
    )
    .map((tg) => tg.name);
  return {
    enabled: browserEnabled(),
    registered,
    chromeId: CHROME_ID,
    firefoxId: FIREFOX_ID,
    chromeExtension: bundledExtension("chrome"),
    firefoxExtension: bundledExtension("firefox"),
  };
}
