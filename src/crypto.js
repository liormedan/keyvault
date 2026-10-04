// Encryption — libsodium primitives only, no home-made crypto.
// Key derivation: Argon2id (crypto_pwhash). Encryption: XChaCha20-Poly1305 (AEAD) — any change to the file fails decryption.
import _sodium from "libsodium-wrappers-sumo";

let sodium;
export async function ready() {
  if (!sodium) {
    await _sodium.ready;
    sodium = _sodium;
  }
  return sodium;
}

// Argon2id parameters: libsodium MODERATE (~256MB, ~1s) — expensive to brute-force, tolerable on unlock.
export async function newKdfParams() {
  const s = await ready();
  return {
    alg: "argon2id13",
    ops: s.crypto_pwhash_OPSLIMIT_MODERATE,
    mem: s.crypto_pwhash_MEMLIMIT_MODERATE,
    salt: s.to_base64(s.randombytes_buf(s.crypto_pwhash_SALTBYTES), s.base64_variants.ORIGINAL),
  };
}

export async function deriveKey(password, kdf) {
  const s = await ready();
  if (kdf.alg !== "argon2id13") throw new Error(`אלגוריתם לא מוכר: ${kdf.alg}`);
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
export async function seal(key, plaintextObj, header) {
  const s = await ready();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ad = s.from_string(JSON.stringify(header));
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(s.from_string(JSON.stringify(plaintextObj)), ad, null, nonce, key);
  const b64 = (u) => s.to_base64(u, s.base64_variants.ORIGINAL);
  return { ...header, nonce: b64(nonce), ct: b64(ct) };
}

export async function open(key, file) {
  const s = await ready();
  const { nonce, ct, ...header } = file;
  const ad = s.from_string(JSON.stringify(header));
  let pt;
  try {
    pt = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      s.from_base64(ct, s.base64_variants.ORIGINAL),
      ad,
      s.from_base64(nonce, s.base64_variants.ORIGINAL),
      key,
    );
  } catch {
    throw new Error("סיסמת אב שגויה, או שהקובץ שונה");
  }
  return JSON.parse(s.to_string(pt));
}

export async function wipe(buf) {
  const s = await ready();
  if (buf) s.memzero(buf);
}

// Random password — randomness from libsodium (randombytes_uniform, unbiased). At least one character from each set.
export async function randomPassword(length = 20, { symbols = true } = {}) {
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
