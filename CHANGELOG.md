# Changelog

## 0.10.0 — 2026-10-09

### Added

- **Sync between computers through a folder you already sync** — Google Drive, Dropbox, OneDrive, iCloud Drive, Syncthing. "Sync…" in the app or `kv sync link <folder>`. The vault stays where it is; the folder gets an encrypted copy (`kv-vault.kv`, same format and header). Every save syncs, and the app also syncs on unlock and whenever the folder or the vault file changes (checked every minute). No server of ours, no account.
- **Item-by-item merge** (`src/sync.ts`): the newer change wins; deletions travel (kept as tombstones for 180 days); a star travels on its own; an item changed on two computers since the last sync keeps both versions — the older one as "(conflict <date>)", with an id derived from the original, so every computer makes the same copy. Conflicted copies made by the cloud client ("kv-vault (1).kv", "… (conflicted copy).kv") are merged and removed.
- **Joining another computer's vault**: if the folder already holds a vault with another master password, kv-vault asks for it, merges this computer's items in, and from then on uses that vault's password and key here too (remember me is renewed). The previous vault file stays as `vault.kv.bak`.
- **A lock and a backup in the folder**: `kv-vault.lock` (stale after a minute) keeps the app, the CLI and the browser host on one computer from syncing at once; every write goes through a temp file and keeps `kv-vault.kv.bak`.
- **Sharing with one person** (`src/share.ts`): every vault gets a sharing key (`kvpk1.…`, an X25519 public key with a checksum). "Share…" on an item, or `kv share <project/KEY> --to <key>` / `kv share --item <title> --to <key>`, seals it to someone's key (libsodium sealed box) in a `.kvshare` file you send any way you like. Only their vault opens it: "Add → Open a shared file…" or `kv receive <file>` shows what's inside by name and adds it. Received dev keys never overwrite existing ones.

### Changed

- Vault contents gain `deleted` (tombstones), `favAt`, this computer's `sync` state (never written to the folder) and `identity` (the sharing key pair). All additive; older vaults open unchanged.
- Renaming a dev key or project marks the new names as changed, so the rename syncs.

## 0.9.0 — 2026-10-08

### Added

- **Browser extension** for Chrome, Edge and Firefox (`extension/`, built to `dist/extension/`). Click it — or press Ctrl+Shift+L — on a sign-in page to see the logins kv-vault has for that site and fill them; copy a password or a two-factor code; generate a password straight to the clipboard. When you submit a sign-in, the extension offers "Save to kv-vault" (or "Update the password") the next time you open it.
- **Native messaging host** (`src/host.ts`): the browser starts it and talks to it over stdin/stdout — no port, no server. It answers only the kv-vault extension (checked by origin), only while you've turned it on, and only with logins for the page's own site; there is no call that lists the vault. It re-reads the vault on every request, so saving from the browser never overwrites a change made in the app meanwhile, and it exits after 5 idle minutes.
- **Site matching** (`src/site.ts`) by registrable domain: `mail.google.com` and `accounts.google.com` share logins; `accounts.google.com.evil.example`, `paypa1.com`, another `*.co.il` or another `*.vercel.app` don't; an https login is never offered to an http page.
- **"Browser extension…"** in the app (and `kv browser [status|enable|disable]`): off until you turn it on. Turning it on registers the host with Chrome, Edge, Chromium and Firefox (HKCU on Windows, the browsers' NativeMessagingHosts folders on macOS and Linux), and shows where to load the extension from until it's in the stores.
- A CI job that runs the extension in a real Chromium against the host: list, fill, notice a new password on submit, update it in the vault, and give nothing to another host.

## 0.8.0 — 2026-10-08

The first release aimed at everyday use, not only developers' keys.

### Added

- **Password health** — a new "Password health" view in the app, and `kv audit` on the command line: passwords reused across items, weak ones (very common, under 8 characters, digits or letters only, one repeated character), ones not changed for a year, and logins without two-factor. Names only — the report never carries a password.
- **Breach check**, opt-in: "Check now" in the health view, or `kv audit --breaches`. Uses Have I Been Pwned's range API — only the first 5 hex characters of each password's SHA-1 leave the machine, with response padding on; the match happens locally. This is the only network call kv-vault makes, and only when asked.
- **Two-factor codes** — a login's two-factor field accepts a base32 key or an `otpauth://totp/` link (SHA-1/256/512, 6–8 digits, any period); the item shows the live code with a countdown and a copy button. The code refreshes for 5 minutes, then pauses so an open dialog doesn't keep the vault awake.
- **Import from password managers** — besides browser CSVs: 1Password (`.1pux`, and CSV), Bitwarden (unencrypted `.json`: logins, cards, identities, notes), KeePass 2 (`.xml`: current entries only — no history, no recycle bin). The format is recognised from the content. Two-factor keys come along; fields a manager marks secret (concealed, hidden, protected) become a secure note next to the item instead of landing in its plain notes. An entry the vault can't hold is skipped and counted instead of failing the import.
- **Emergency export** — "Emergency export…" in the app, `kv export <file>` on the command line: an encrypted copy of the whole vault, in the vault's own format, under a separate password or a generated 32-character recovery code (about 158 bits, no look-alike characters) that is shown once to print. `kv restore <file>` makes a vault from it with a new master password. Exports never overwrite a file.

### Changed

- `kv import-passwords` takes any of the supported exports, and reports the format it found.
- The desktop backend's `importCsv` method is now `importFile`.
- The window can open a save dialog (`dialog:allow-save`), for the export.

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
- **The desktop app couldn't start its backend from a verbatim Windows path** (`\\?\D:\…`, which Tauri can return): Node failed with `EISDIR: lstat 'D:'` and the window showed "locked". Found by the window test on GitHub's runner. The prefix is now dropped for drive paths, and `KV_BACKEND_LOG` lets a test collect the backend's startup errors.

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
