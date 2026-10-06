# kv-vault — notes for coding agents

Read [README.md](README.md) first. Private, machine-specific notes go in `CLAUDE.local.md` (gitignored).

## Rules

1. **No home-made crypto.** libsodium primitives only (`src/crypto.ts`). A change to the vault file format gets a new version (`v`) and a migration — existing vaults must keep opening. Additive changes inside the encrypted payload (like `items`) are normalized on open (`store.normalize`).
2. **Never touch a real vault in tests or manual checks.** Always a temporary `KV_HOME`; `KV_NO_OPEN=1` for `kv ui`. When the installed desktop app is running, a test instance also needs its own `WEBVIEW2_USER_DATA_FOLDER`.
3. **Never print, log or pass key values** — not in output, argv or error messages. Values travel over stdin / pipes only.
4. **Never type or read the user's master password.** The user types it.
5. Every change: `npm test` passes, plus a manual check against a temporary vault, before committing.

## Layout

| Path | Role |
|---|---|
| `src/crypto.ts` | Argon2id key derivation, XChaCha20-Poly1305 with the header as additional data, password generator |
| `src/store.ts` | vault file (`~/.keyvault/vault.kv`): atomic write + `.bak`, dev keys (`projects`) and typed items (`items`) |
| `src/model.ts` | the data model (vault file, items, listings) — types only |
| `src/protocol.ts` | the window ↔ backend contract: every method's params and result. Change it first, then both sides; `test/protocol.typecheck.ts` proves bad calls fail to compile |
| `src/types.ts` | item types — fields, `secret`, `generate`, `primary`. Single source for the backend and the window |
| `src/import-csv.ts` | login import from a browser / password-manager CSV export. Never read a browser's password store directly — only the user's own export file |
| `src/backend.ts` | desktop backend: one JSON line per request/reply on stdin/stdout, auto-lock after 15 minutes. `methods ... satisfies Handlers` — checked against `src/protocol.ts`. Finishes queued requests before exiting on stdin close |
| `src/remember.ts` | "remember me" per platform: DPAPI on Windows (`dpapi.ts`), Keychain / Secret Service elsewhere (`@napi-rs/keyring`, optional native dependency — external to the bundles) |
| `src/project.ts` | `.kv.json` — find the project from the cwd upwards, suggest a name, write the file (names only) |
| `src/completion.ts` | `kv completion <shell>` scripts — commands and flags only, never vault contents |
| `src/dpapi.ts` | "remember me": the derived key encrypted with Windows DPAPI via PowerShell (stdin, not argv) |
| `src/io.ts` | hidden input, stdin, clipboard per platform. Windows copies are private (no history / cloud sync). The 20 s clear runs in a **detached Node** process (a detached PowerShell never starts); only the hash is on its command line |
| `src/cli.ts` | the `kv` command (`npm link`) |
| `src/ui-server.ts` + `src/ui.html` | browser UI for `kv ui`: 127.0.0.1, random port and token, Host/Origin checks |
| `app/src-tauri/` | Tauri 2 shell: spawns `node backend.mjs` (bundled resource, `KV_BACKEND` override, source fallback in dev) and relays the `kv` command. No crypto |
| `app/ui/` | the window — HTML/CSS + TypeScript bundled to `app/ui/dist/` (`head` = theme + language before first paint, `app`). `app.ts` calls the backend through `kv<M>()` typed by `src/protocol.ts`; `globals.d.ts` types Tauri and `window.I18N`. CSP without inline script |
| `scripts/build.mjs` | the only build: esbuild for the CLI, backend and window |
| `test/e2e/app.e2e.ts` | the real window: starts the built exe with a temporary `KV_HOME` and its own `WEBVIEW2_USER_DATA_FOLDER`, drives WebView2 over CDP (playwright-core). `npm run test:e2e` — local only: on GitHub's hosted Windows runner the app starts but WebView2 never opens the debug port (tried 06.10.2026) |
| `test/` | `node:test` suites (Node type stripping), each with its own temporary vault. `test/fixtures/vault-pre-ts.kv` is a vault written by v0.1 — it must keep opening unchanged. `*.typecheck.ts` are compile-time checks |

## Build

```bash
npm run build            # scripts/build.mjs (esbuild): dist/cli.js, app/src-tauri/resources/backend.mjs, app/ui/dist/{head,app}.js
npm run typecheck        # tsc --noEmit (TypeScript 7)
npm test
npm run test:e2e         # after app:build — the full window flow in both languages
npm run app:build        # app/src-tauri/target/release/kv-vault.exe
npm run app:installer    # NSIS installer
```

The interface is English by default with Hebrew as an option: backend/CLI strings in `src/i18n.ts` (`t(key)`), window strings in `app/ui/i18n.ts` (`tr(key)`, `L({en, he})` for type labels). Every user-facing string goes through one of them — add both languages. Code, comments and docs are in English.
