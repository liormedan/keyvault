// "Remember me": the derived key (never the password) kept in the operating system's own secret store,
// so `kv` and the app can unlock without asking. Only this user on this machine can read it back.
//   Windows → DPAPI (dpapi.ts — no native code)
//   macOS   → Keychain, Linux → Secret Service (GNOME Keyring, KWallet) — via @napi-rs/keyring
import fs from "node:fs";
import path from "node:path";
import * as dpapi from "./dpapi.ts";
import { t } from "./i18n.ts";
import { HOME } from "./store.ts";

const SERVICE = "kv-vault";
/** Which vault the keychain entry belongs to (the KDF salt) — the key itself is in the keychain */
const MARKER = path.join(HOME, "key.keychain");
const WINDOWS = process.platform === "win32";

type Keyring = typeof import("@napi-rs/keyring");
let keyringModule: Keyring | null = null;

async function entry(salt: string) {
  if (!keyringModule) {
    try {
      keyringModule = await import("@napi-rs/keyring");
    } catch {
      throw new Error(t("remember.unavailable"));
    }
  }
  return new keyringModule.Entry(SERVICE, `vault-${salt}`);
}

const readMarker = (): { salt?: string } => {
  try {
    return JSON.parse(fs.readFileSync(MARKER, "utf8")) as { salt?: string };
  } catch {
    return {};
  }
};

/** Shown in the window as "remember me on this computer" */
export const supported = true;

export async function remember(key: Uint8Array, salt: string): Promise<void> {
  if (WINDOWS) return dpapi.remember(key, salt);
  const e = await entry(salt);
  try {
    e.setPassword(Buffer.from(key).toString("base64"));
  } catch (err) {
    throw new Error(`${t("remember.unavailable")} (${(err as Error).message})`);
  }
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(MARKER, JSON.stringify({ salt }), { mode: 0o600 });
}

/** The key, or null if nothing is remembered, the vault was replaced since, or the keychain refuses */
export async function recall(salt: string): Promise<Uint8Array | null> {
  if (WINDOWS) return dpapi.recall(salt);
  if (readMarker().salt !== salt) return null;
  try {
    const b64 = (await entry(salt)).getPassword();
    return b64 ? new Uint8Array(Buffer.from(b64, "base64")) : null;
  } catch {
    return null;
  }
}

export async function forget(): Promise<void> {
  if (WINDOWS) return dpapi.forget();
  const { salt } = readMarker();
  if (salt) {
    try {
      (await entry(salt)).deletePassword();
    } catch {
      // already gone, or no keychain — the marker below is what `remembered` reads
    }
  }
  fs.rmSync(MARKER, { force: true });
}

export const remembered = (): boolean => (WINDOWS ? dpapi.remembered() : fs.existsSync(MARKER));
