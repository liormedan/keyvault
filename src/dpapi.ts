// "Remember me" on Windows: the derived key (not the password) is encrypted with the current user's DPAPI.
// Only the same user on the same machine can decrypt it. The key goes to PowerShell over stdin, never on the command line.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { t } from "./i18n.ts";
import { HOME } from "./store.ts";

const CACHE = path.join(HOME, "key.dpapi");

function ps(script: string, input: string): string {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

const PROTECT =
  "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); " +
  "[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser'))";
const UNPROTECT =
  "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); " +
  "[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))";

export const supported = process.platform === "win32";

export function remember(key: Uint8Array, salt: string): void {
  if (!supported) throw new Error(t("remember.windowsOnly"));
  const blob = ps(PROTECT, Buffer.from(key).toString("base64"));
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ salt, blob }), { mode: 0o600 });
}

// Returns the key, or null if nothing is remembered / the vault was replaced since
export function recall(salt: string): Uint8Array | null {
  if (!supported || !fs.existsSync(CACHE)) return null;
  try {
    const { salt: s, blob } = JSON.parse(fs.readFileSync(CACHE, "utf8")) as { salt: string; blob: string };
    if (s !== salt) return null;
    return new Uint8Array(Buffer.from(ps(UNPROTECT, blob), "base64"));
  } catch {
    return null;
  }
}

export function forget(): void {
  if (fs.existsSync(CACHE)) fs.rmSync(CACHE);
}

export const remembered = (): boolean => fs.existsSync(CACHE);
