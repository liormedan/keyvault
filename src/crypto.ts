// Encryption — libsodium primitives only, no home-made crypto.
// Key derivation: Argon2id (crypto_pwhash). Encryption: XChaCha20-Poly1305 (AEAD) — any change to the file fails decryption.
import _sodium from "libsodium-wrappers-sumo";
import { t } from "./i18n.ts";
import type { KdfParams, VaultFile, VaultHeader } from "./model.ts";

type Sodium = typeof _sodium;

let sodium: Sodium | undefined;
export async function ready(): Promise<Sodium> {
  if (!sodium) {
    await _sodium.ready;
    sodium = _sodium;
  }
  return sodium;
}

// Argon2id parameters: libsodium MODERATE (~256MB, ~1s) — expensive to brute-force, tolerable on unlock.
export async function newKdfParams(): Promise<KdfParams> {
  const s = await ready();
  return {
    alg: "argon2id13",
    ops: s.crypto_pwhash_OPSLIMIT_MODERATE,
    mem: s.crypto_pwhash_MEMLIMIT_MODERATE,
    salt: s.to_base64(s.randombytes_buf(s.crypto_pwhash_SALTBYTES), s.base64_variants.ORIGINAL),
  };
}

export async function deriveKey(password: string, kdf: KdfParams): Promise<Uint8Array> {
  const s = await ready();
  if (kdf.alg !== "argon2id13") throw new Error(t("kdf.unknown", { alg: kdf.alg }));
  return s.crypto_pwhash(
    s.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    password,
    s.from_base64(kdf.salt, s.base64_variants.ORIGINAL),
    kdf.ops,
    kdf.mem,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
}

// The header (version + KDF params) is bound as additional data — it cannot be swapped without failing decryption.
export async function seal(key: Uint8Array, plaintextObj: unknown, header: VaultHeader): Promise<VaultFile> {
  const s = await ready();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ad = s.from_string(JSON.stringify(header));
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(s.from_string(JSON.stringify(plaintextObj)), ad, null, nonce, key);
  const b64 = (u: Uint8Array) => s.to_base64(u, s.base64_variants.ORIGINAL);
  return { ...header, nonce: b64(nonce), ct: b64(ct) };
}

export async function open<T>(key: Uint8Array, file: VaultFile): Promise<T> {
  const s = await ready();
  const { nonce, ct, ...header } = file;
  const ad = s.from_string(JSON.stringify(header));
  let pt: Uint8Array;
  try {
    pt = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      s.from_base64(ct, s.base64_variants.ORIGINAL),
      ad,
      s.from_base64(nonce, s.base64_variants.ORIGINAL),
      key,
    );
  } catch {
    throw new Error(t("pw.wrong"));
  }
  return JSON.parse(s.to_string(pt)) as T;
}

export async function wipe(buf: Uint8Array | null | undefined): Promise<void> {
  const s = await ready();
  if (buf) s.memzero(buf);
}

// Recovery code for an emergency export: 32 characters (about 158 bits) from libsodium randomness, in groups of four.
// The alphabet has no 0/O or 1/I/L, so a printed code reads back unambiguously.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 symbols
export async function recoveryCode(): Promise<string> {
  const s = await ready();
  let out = "";
  for (let i = 0; i < 32; i++) out += CODE_ALPHABET[s.randombytes_uniform(CODE_ALPHABET.length)];
  return out.match(/.{4}/g)!.join("-");
}

/** A typed recovery code in the form it was sealed with: upper case, no spaces or dashes */
export const canonicalCode = (typed: string): string => typed.toUpperCase().replace(/[\s-]/g, "");

// Random password — randomness from libsodium (randombytes_uniform, unbiased). At least one character from each set.
export async function randomPassword(length: number = 20, { symbols = true }: { symbols?: boolean } = {}): Promise<string> {
  const s = await ready();
  const sets = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789"];
  if (symbols) sets.push("!@#$%^&*-_=+?");
  const n = Math.min(128, Math.max(8, Math.floor(Number(length)) || 20));
  const all = sets.join("");
  for (;;) {
    let out = "";
    for (let i = 0; i < n; i++) out += all[s.randombytes_uniform(all.length)];
    if (sets.every((set) => [...out].some((c) => set.includes(c)))) return out;
  }
}
