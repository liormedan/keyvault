# Changelog

## 0.3.0 — unreleased

### Added

- **macOS and Linux.** The `kv` CLI runs on all three; CI tests Windows, macOS and Ubuntu.
- **`npm install -g kv-vault`.** Published from GitHub Actions with npm provenance; the Windows installer is built there too, with a build attestation and its SHA-256 in the release notes.
- **Remember me through the system keychain** on macOS (Keychain) and Linux (Secret Service). Windows keeps DPAPI.
- **Clipboard on macOS and Linux** (`pbcopy`, `wl-copy`, `xclip`), with the same 20-second clear.
- `kv --version`, `kv status [--json]`, `kv ls --json` (names only), `kv completion <bash|zsh|fish|powershell>`.
- Documented exit codes: `0` ok · `1` failed · `2` wrong arguments.

## 0.2.1 — 2026-10-06

### Changed

- **Renamed to kv-vault** (repository and npm package). The command is still `kv`, and the vault stays in `~/.keyvault`, so nothing to migrate.

### Security

- **Copied secrets no longer land in Windows clipboard history (Win+V) or cloud clipboard sync.** Copies are marked private with the `ExcludeClipboardContentFromMonitorProcessing` / `CanIncludeInClipboardHistory` / `CanUploadToCloudClipboard` formats; before, a copied value outlived the 20-second clear in the history.
- **The vault locks when Windows locks** — Win+L, sign-out, or waking from sleep to the lock screen. The window clears its list and returns to the unlock screen.
- CodeQL (security-extended) on every PR and weekly; Dependabot for npm, Cargo and GitHub Actions.

### Fixed

- **The clipboard was never cleared after 20 seconds on Windows** — since 0.1. The clear ran in a detached PowerShell, which never starts on Windows. It now runs in a detached Node process, and a Windows CI test copies, checks the private formats and waits for the clear on a real clipboard.

## 0.2.0 — 2026-10-06

### Added

- **Import from browsers.** Pick the password CSV exported by Chrome, Edge, Firefox or Safari (also Bitwarden, LastPass, 1Password). Columns are matched by name, exact duplicates are skipped, and the app offers to delete the plaintext export afterwards. Only the file path crosses the window — the backend reads the file. CLI: `kv import-passwords <file.csv> [--delete]`.
- **English and Hebrew.** English by default; a language button on every screen switches the whole layout to Hebrew (right-to-left) and back, and the choice is remembered. Errors from the backend follow the same language. CLI: `kv lang <en|he>` or `KV_LANG`.

### Changed

- **TypeScript.** The whole codebase is now strict TypeScript. `src/protocol.ts` is the single contract between the window and the backend: the backend `satisfies` it and the window calls through it, so a wrong method name, parameter or result field fails to compile on either side. Message keys are typed too, and the Hebrew tables must cover every English key.
- One build (`npm run build`, esbuild) for the CLI, the backend and the window. `kv` now runs the bundle in `dist/`.
- Node.js 22.6 or newer.

### Fixed

- Deleting an item or a dev key no longer happens without waiting for the confirmation (the dialog plugin turned `window.confirm` into an always-true promise).
- Closing the window while a save was in flight could lose that change; the backend now finishes queued requests before exiting.
- A backend request or a `kv` command named after an `Object` prototype member (`toString`, `constructor`) reached that member; both now answer "unknown".
- An item type named after a prototype member is rejected instead of crashing.

### Tests

- A vault written by 0.1 is kept as a fixture; a test opens it and checks every value, so the file format can't drift.
- Compile-time checks for the window ↔ backend contract and the message keys.
- The end-to-end test of the real desktop window is now in the repo (`npm run test:e2e`, local Windows).

## 0.1.0 — 2026-10-04

First public release: encrypted vault file (Argon2id + XChaCha20-Poly1305 via libsodium), Tauri desktop app with typed items (logins, cards, bank accounts, IDs, Wi-Fi, servers, licenses, notes), password generator, favorites, dark/light theme, "remember me" via Windows DPAPI, and the `kv` CLI for dev keys.
