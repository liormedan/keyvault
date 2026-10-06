# Changelog

## 0.7.0 — 2026-10-06

### Added

- **[docs/CLI.md](docs/CLI.md)** — the complete command reference: commands, flags, exit codes, environment variables and every `--json` shape. The interface 1.0 will commit to.
- **Docs for contributors:** [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (with a diagram and the threat model), and [docs/FORMAT.md](docs/FORMAT.md) — the vault file format, precise enough to write an independent reader. A test does exactly that: it opens the 0.1 fixture using only libsodium and the document.
- Issue and PR templates; security reports go to GitHub's private advisories.
- A terminal demo in the README, generated from the real CLI by `scripts/demo-svg.mjs`.
- `npm run release -- <x.y.z>` sets the version in all four places and dates the changelog.

### Changed

- **Biome** for lint and format, in CI. Lint findings were fixed in the code rather than switched off.
- **Coverage** in CI (Ubuntu) with a threshold of 75% of lines (measured on Linux, where Windows-only code paths are not run), summarized on each run.
- The window test runs in CI again, against a test-only build whose window config opens the DevTools port (`tauri.e2e.conf.json` — never used for releases).

### Fixed

- File-system races CodeQL flagged in `kv guard` and `kv scan`: files are now checked and read (or written) through one handle.

## 0.6.0 — unreleased

### Added

- **`kv guard`** — checks the lines a commit adds against every value in the vault (dev keys in every environment, secret fields of items; values of 8+ characters) and stops the commit, reporting file, line and key name — never the value. `kv guard install` / `uninstall` manage a pre-commit hook (and won't overwrite someone else's), `--all` sweeps every tracked file, `--strict` blocks when the vault is locked instead of skipping.
- **`kv scan [dir]`** — finds `.env` files (templates marked), private keys, `.npmrc` tokens and credential JSON files; for each value, whether it is already in the vault (compared by hash) and whether the file is tracked by git. Paths and names only; `--json`. `--import` moves what isn't in the vault yet into a project per folder.
- **`kv doctor`** — Node version, vault and its permissions, remember-me, last backup, `.kv.json` and its project, the guard hook, keys not updated for a year.

## 0.5.0 — unreleased

### Added

- **`kv push vercel|github`** — every key of a project (for an environment) to Vercel environment variables or GitHub Actions secrets, through the `vercel` and `gh` CLIs you're already logged into. Values travel only on stdin. `--env prod` maps to Vercel's production target (`--target` to choose), `--sensitive`, `--repo`, `--environment`, `--dry-run`.
- **`kv pull vercel`** — Vercel's values into the vault, through a private temp file deleted at once; Vercel's own `VERCEL_*` variables are left out.
- **`kv diff vercel|github`** — only in the vault / only on the platform / different value (Vercel, compared by hash). Names only; `--json`; exit 1 when anything differs, so CI can gate on it.

### Security

- Arguments to platform CLIs are validated (names, targets, repo names, our own temp paths); shell metacharacters are refused before anything runs.

## 0.4.0 — unreleased

### Added

- **Project files.** `kv init-project` writes `.kv.json` (`{"project": "my-app"}` — names only, safe to commit). `kv run -- <cmd>`, `kv env`, `kv example` and `kv check` find the project from the current folder or any folder above.
- **Environments.** Any key can have its own value per environment: `kv set my-app/DB_URL --env prod`, `kv run --env prod -- …`. Keys without one use their default. `.kv.json` can name a default environment for the folder. The desktop app shows which environments a key has.
- **`kv env`** — the project's values as `sh`, `pwsh`, `fish`, `dotenv` or `json`, for `eval` or a pipe (refuses to print to a terminal, like `kv get`). Values are quoted so nothing in them is interpreted.
- **`kv example`** (`.env.example`, names only) and **`kv check`** (exit 1 with the names the vault is missing).
- **`kv mv`** — rename a key, move it to another project, or rename a project.

### Changed

- `kv run` and every command read their own flags before positional arguments, and stop at `--`: flags after it belong to the command being run.

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
