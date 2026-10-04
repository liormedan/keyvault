# keyvault — notes for coding agents

Read [README.md](README.md) first. Private, machine-specific notes go in `CLAUDE.local.md` (gitignored).

## Rules

1. **No home-made crypto.** libsodium primitives only (`src/crypto.js`). A change to the vault file format gets a new version (`v`) and a migration — existing vaults must keep opening. Additive changes inside the encrypted payload (like `items`) are normalized on open (`store.normalize`).
2. **Never touch a real vault in tests or manual checks.** Always a temporary `KV_HOME`; `KV_NO_OPEN=1` for `kv ui`. When the installed desktop app is running, a test instance also needs its own `WEBVIEW2_USER_DATA_FOLDER`.
3. **Never print, log or pass key values** — not in output, argv or error messages. Values travel over stdin / pipes only.
4. **Never type or read the user's master password.** The user types it.
5. Every change: `npm test` passes, plus a manual check against a temporary vault, before committing.

## Layout

| Path | Role |
|---|---|
| `src/crypto.js` | Argon2id key derivation, XChaCha20-Poly1305 with the header as additional data, password generator |
| `src/store.js` | vault file (`~/.keyvault/vault.kv`): atomic write + `.bak`, dev keys (`projects`) and typed items (`items`) |
| `src/types.js` | item types — fields, `secret`, `generate`, `primary`. Single source for the backend and the window |
| `src/backend.js` | desktop backend: one JSON line per request/reply on stdin/stdout, auto-lock after 15 minutes. Finishes queued requests before exiting on stdin close |
| `src/dpapi.js` | "remember me": the derived key encrypted with Windows DPAPI via PowerShell (stdin, not argv) |
| `src/io.js` | hidden input, stdin, clipboard cleared after 20 s (hash comparison) |
| `src/cli.js` | the `kv` command (`npm link`) |
| `src/ui-server.js` + `src/ui.html` | browser UI for `kv ui`: 127.0.0.1, random port and token, Host/Origin checks |
| `app/src-tauri/` | Tauri 2 shell: spawns `node backend.mjs` (bundled resource, `KV_BACKEND` override, source fallback in dev) and relays the `kv` command. No crypto |
| `app/ui/` | the window — plain HTML/JS/CSS, CSP without inline script |
| `test/` | `node:test` suites, each with its own temporary vault |

## Build

```bash
npm test
npm run build:backend    # esbuild → app/src-tauri/resources/backend.mjs (also runs before every Tauri build)
npm run app:build        # app/src-tauri/target/release/keyvault.exe
npm run app:installer    # NSIS installer
```

The UI and CLI messages are in Hebrew; code, comments and docs are in English.
