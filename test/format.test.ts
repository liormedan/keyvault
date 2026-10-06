import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import sodium from "libsodium-wrappers-sumo";

// docs/FORMAT.md claims a vault can be read with nothing but libsodium and these steps.
// This reader follows the document only — it doesn't import src/ — so the document can't drift.
test("an independent reader, written from docs/FORMAT.md, opens the 0.1 fixture", async () => {
  await sodium.ready;
  const file = JSON.parse(fs.readFileSync(new URL("./fixtures/vault-pre-ts.kv", import.meta.url), "utf8"));
  const b64 = (s: string) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL);

  assert.equal(file.v, 1);
  assert.equal(file.kdf.alg, "argon2id13");
  assert.equal(b64(file.kdf.salt).length, 16);
  assert.equal(b64(file.nonce).length, 24);

  const key = sodium.crypto_pwhash(
    32,
    "fixture password — not a real vault",
    b64(file.kdf.salt),
    file.kdf.ops,
    file.kdf.mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  const ad = sodium.from_string(JSON.stringify({ v: file.v, kdf: file.kdf }));
  const plain = JSON.parse(sodium.to_string(sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, b64(file.ct), ad, b64(file.nonce), key)));

  assert.equal(plain.projects["demo-app"].API_KEY.value, "fixture-api-value");
  const login = Object.values(plain.items as Record<string, { type: string; fields: Record<string, string> }>).find((i) => i.type === "login")!;
  assert.equal(login.fields.password, "fixture-login-pw");
});
