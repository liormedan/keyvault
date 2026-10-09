# Vault file format (version 1)

A vault is one UTF-8 JSON file, by default `~/.keyvault/vault.kv`. This document is enough to write an independent reader.

## Outer file

```json
{
  "v": 1,
  "kdf": { "alg": "argon2id13", "ops": 3, "mem": 268435456, "salt": "<base64>" },
  "nonce": "<base64, 24 bytes>",
  "ct": "<base64>"
}
```

| Field | Meaning |
|---|---|
| `v` | format version — `1` |
| `kdf.alg` | `argon2id13` — Argon2id, libsodium's `crypto_pwhash_ALG_ARGON2ID13` |
| `kdf.ops`, `kdf.mem` | opslimit and memlimit (libsodium `MODERATE` when created: 3 and 256 MiB) |
| `kdf.salt` | 16 bytes, base64 (standard alphabet, padded) |
| `nonce` | 24 bytes, base64 |
| `ct` | ciphertext + 16-byte tag, base64 |

## Decryption

1. **Key:** `crypto_pwhash(32, password, salt, ops, mem, ARGON2ID13)` → 32 bytes.
2. **Additional data:** the UTF-8 bytes of `JSON.stringify({ v, kdf })` — the outer object without `nonce` and `ct`, keys in that order. Changing anything in the header therefore fails decryption.
3. **Plaintext:** `crypto_aead_xchacha20poly1305_ietf_decrypt(ct, ad, nonce, key)` → UTF-8 JSON (below).

A new random nonce is used for every save.

## Plaintext

```jsonc
{
  "created": "2026-10-04T00:09:00.000Z",
  "projects": {
    "my-app": {
      "API_KEY": {
        "value": "…",                 // default value; "" if the key only has per-environment values
        "note": "…",
        "updated": "2026-10-06T…",
        "envs": {                     // optional (0.4+): per-environment values
          "prod": { "value": "…", "updated": "…" }
        }
      }
    }
  },
  "items": {                          // optional (0.2+): typed items, by id
    "<uuid>": {
      "id": "<uuid>", "type": "login", "title": "GitHub",
      "fields": { "url": "…", "username": "…", "password": "…" },
      "fav": false, "created": "…", "updated": "…"
    }
  }
}
```

Item types and their fields are defined in [`src/types.ts`](../src/types.ts). Readers should treat missing `items` and `envs` as empty — vaults from earlier versions don't have them.

## Sync folder

`kv-vault.kv` in the sync folder is the same format with the same header (and so the same key) as the vault, minus `sync` in the plaintext. `kv-vault.kv.bak` is its previous version and `kv-vault.lock` a short-lived lock. Fields added in 0.10 to the plaintext: `deleted` (`"item:<id>"` / `"dev:<project>/<key>"` → ISO time), `favAt` on items, `sync: { lastSync }` (this computer only), `identity: { publicKey, secretKey }` (X25519, base64).

## Share files

`.kvshare`: `{ "kind": "kv-vault-share", "v": 1, "to": <base64url of the first 9 bytes of BLAKE2b-128 of the recipient's public key>, "sealed": <base64 crypto_box_seal of the JSON payload> }`. Payload: `{ v: 1, at, items: [{ type, title, fields }], dev: [{ project, key, value, note }] }`. A sharing key reads `kvpk1.<base64url public key>.<base64url of the first 3 bytes of BLAKE2b-128 of it>`.

## Emergency export

`kv export` and the app's emergency export write a file in exactly this format, sealed under the export's own password with fresh KDF parameters (new salt). With a recovery code, the password is the code without its dashes, in upper case: 32 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, generated with libsodium's `randombytes_uniform`. The plaintext is the same JSON as the vault's. `kv restore` reads it and writes a new vault under a new master password.

## Remember me

Not part of the vault file. The 32-byte derived key is stored by the OS: `~/.keyvault/key.dpapi` on Windows (`{ "salt", "blob" }`, DPAPI `CurrentUser`), or the system keychain (service `kv-vault`, account `vault-<salt>`) with a `key.keychain` marker on macOS and Linux. The salt ties it to one vault: a new vault (or a changed master password) invalidates it.
