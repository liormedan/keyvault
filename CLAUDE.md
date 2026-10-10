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
| `src/import-csv.ts` | CSV export parser (browsers, LastPass, 1Password/Bitwarden CSV). Never read a browser's password store directly — only the user's own export file |
| `src/import-file.ts` + `src/unzip.ts` | every import: recognises CSV, 1Password `.1pux` (zip), Bitwarden JSON, KeePass XML by content. Secret extra fields go into a secure note, never into plain notes |
| `src/health.ts` | password health (reused, weak, old, no 2FA) — names only, in memory |
| `src/breach.ts` | Have I Been Pwned range check, only on request; only 5 hex chars of SHA-1 leave. The fetcher is injectable — tests never touch the network |
| `src/host.ts` | native messaging host for the browser extension: framed JSON on stdin/stdout (`src/native-messaging.ts`). Only the extension's origin (`src/browser-ids.ts`), only when `config.json` has `browser: true`, only logins for the page's site (`src/site.ts`). Keeps the key, re-reads the vault per request. Error codes, not messages |
| `src/browser-setup.ts` | turning the extension on/off: launcher + manifests in `~/.keyvault/native-host/`, HKCU registry values (Windows) or the browsers' NativeMessagingHosts folders. `reg` is injectable — **tests never touch the real registry**; the real-browser test (`test/e2e/extension.e2e.ts`) runs only in CI (`KV_TEST_BROWSER=1`) |
| `extension/` | the MV3 extension (Chrome/Edge/Firefox): popup (list, fill, copy, save), content script (notices a submitted sign-in), background (pending save in `storage.session`, Ctrl+Shift+L). Built by `scripts/build.mjs` to `dist/extension/<browser>` and into the installer. The manifest `key` fixes the Chrome ID |
| `src/sync.ts` | sync through a user's cloud folder: lock → read vault (from disk) + folder copy + conflicted copies → `merge` (per item / dev key, newer wins, tombstones, both versions on a two-sided edit with a deterministic copy id) → write both. `store.setAfterSave` makes every save sync. Joining another vault switches this computer to that vault's header and key |
| `src/share.ts` | `.kvshare`: items / dev keys sealed (crypto_box_seal) to a `kvpk1.` sharing key. The sender is anonymous — `openShare` drops anything the vault can't hold |
| `src/totp.ts` | RFC 6238 codes from a login's `totp` field. HMAC and the breach SHA-1 come from `node:crypto` (protocol requirements libsodium lacks) — the vault's encryption stays libsodium-only |
| `src/backend.ts` | desktop backend: one JSON line per request/reply on stdin/stdout, auto-lock after 15 minutes. `methods ... satisfies Handlers` — checked against `src/protocol.ts`. Finishes queued requests before exiting on stdin close |
| `src/remember.ts` | "remember me" per platform: DPAPI on Windows (`dpapi.ts`), Keychain / Secret Service elsewhere (`@napi-rs/keyring`, optional native dependency — external to the bundles) |
| `src/project.ts` | `.kv.json` — find the project from the cwd upwards, suggest a name, write the file (names only) |
| `src/platforms.ts` | `kv push/pull/diff` through `vercel` / `gh`. Values only on stdin; every argument validated (`SAFE_ARG`) because Windows runs the .cmd shims through a shell. `Runner` is injectable for tests |
| `src/guard.ts` | `kv guard`: vault values (≥ 8 chars, not `tooGeneric`) vs. the lines a commit adds (`git diff --cached -U0`), every tracked file, or the whole history (`git log --all -p`); the pre-commit hook. Reports names, never values |
| `src/scan.ts` | `kv scan`: `.env` and key files on disk, matched to the vault by hash; tracked-by-git check |
| `src/completion.ts` | `kv completion <shell>` scripts — commands and flags only, never vault contents |
| `src/dpapi.ts` | "remember me": the derived key encrypted with Windows DPAPI via PowerShell (stdin, not argv) |
| `src/io.ts` | hidden input, stdin, clipboard per platform. Windows copies are private (no history / cloud sync). The 20 s clear runs in a **detached Node** process (a detached PowerShell never starts); only the hash is on its command line |
| `src/cli.ts` | the `kv` command (`npm link`) |
| `src/ui-server.ts` + `src/ui.html` | browser UI for `kv ui`: 127.0.0.1, random port and token, Host/Origin checks |
| `app/src-tauri/` | Tauri 2 shell: spawns `node backend.mjs` (bundled resource, `KV_BACKEND` override, source fallback in dev) and relays the `kv` command. No crypto |
| `app/ui/` | the window — HTML/CSS + TypeScript bundled to `app/ui/dist/` (`head` = theme + language before first paint, `app`). `app.ts` calls the backend through `kv<M>()` typed by `src/protocol.ts`; `globals.d.ts` types Tauri and `window.I18N`. CSP without inline script |
| `scripts/bundle-node.mjs` | copies the running Node binary to `app/src-tauri/resources/node.exe` before every desktop build, so the installed app doesn't need Node; the shell prefers it over PATH |
| `scripts/build.mjs` | the only build: esbuild for the CLI, backend and window |
| `app/src-tauri/tauri.e2e.conf.json` | merged over tauri.conf.json by `npm run app:build:e2e`: the window opens WebView2's DevTools port for the CI window test. **Never for releases.** Tauri rejects unknown keys (no `$comment`) |
| `test/e2e/app.e2e.ts` | the real window: starts the built exe with a temporary `KV_HOME` and its own `WEBVIEW2_USER_DATA_FOLDER`, drives WebView2 over CDP (playwright-core). `npm run test:e2e` after `npm run app:build:e2e`; runs in CI (the `e2e` job). `KV_BACKEND_LOG` collects the backend's stderr when the first screen never shows |
| `test/` | `node:test` suites (Node type stripping), each with its own temporary vault. `test/fixtures/vault-pre-ts.kv` is a vault written by v0.1 — it must keep opening unchanged. `*.typecheck.ts` are compile-time checks |

## Build

```bash
npm run build            # scripts/build.mjs (esbuild): dist/cli.js, app/src-tauri/resources/backend.mjs, app/ui/dist/{head,app}.js
npm run typecheck        # tsc --noEmit (TypeScript 7)
npm run lint             # Biome (biome.json); npm run format to fix
npm run test:coverage    # coverage threshold, lines ≥ 75% (CI measures on Linux, where Windows-only code does not run)
npm run release -- x.y.z # version in package.json, tauri.conf.json, Cargo.toml/.lock; dates CHANGELOG
npm test
npm run test:e2e         # after app:build — the full window flow in both languages
npm run app:build        # app/src-tauri/target/release/kv-vault.exe
npm run app:installer    # NSIS installer
```

The interface is English by default with Hebrew as an option: backend/CLI strings in `src/i18n.ts` (`t(key)`), window strings in `app/ui/i18n.ts` (`tr(key)`, `L({en, he})` for type labels). Every user-facing string goes through one of them — add both languages. Code, comments and docs are in English.
