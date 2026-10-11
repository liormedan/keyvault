// Whether the desktop app checks for a new version. The check itself runs in the window (Tauri's updater plugin):
// it reads latest.json from this repository's newest GitHub release, and installs only an update signed with the key
// whose public half is in tauri.conf.json. Nothing about the vault is sent — GitHub sees an ordinary download.
// On by default; the choice lives in config.json, next to the language. KV_NO_UPDATE_CHECK=1 makes the default off
// (tests: no network unless a test turns it on).
import fs from "node:fs";
import path from "node:path";
import { HOME } from "./store.ts";

const CONFIG = path.join(HOME, "config.json");

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function updatesEnabled(): boolean {
  const on = readConfig().updates;
  return typeof on === "boolean" ? on : !process.env.KV_NO_UPDATE_CHECK;
}

export function setUpdates(on: boolean): void {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ ...readConfig(), updates: on }, null, 1));
}
