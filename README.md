# keyvault

A local, encrypted vault for the keys and passwords a developer collects: API keys per project, logins, cards, bank details, IDs, Wi-Fi, servers, licenses and secure notes.
One encrypted file on your machine, a Windows desktop app, and a `kv` command line. Nothing leaves the computer.

![keyvault desktop app](docs/screenshot.png)

> The interface is in English by default, with Hebrew (right-to-left) one click away — the language button in the app, or `kv lang he` for the command line.

## Features

- **One encrypted file** — `~/.keyvault/vault.kv`. Argon2id key derivation and XChaCha20-Poly1305 encryption, both from [libsodium](https://doc.libsodium.org/). Project and key names are encrypted too.
- **Desktop app** (Tauri 2) — dark or light theme, categories, search, favorites, reveal / copy / edit / delete, auto-lock after 15 idle minutes.
- **Typed items** — login, credit card, bank account, identity document, Wi-Fi, server/SSH, software license, secure note — plus dev keys grouped by project.
- **Secrets stay hidden** — secret fields never appear in lists and reach the window only when you click reveal. Copy goes straight to the clipboard and is cleared after 20 seconds.
- **Import from browsers** — pick the password CSV exported by Chrome, Edge, Firefox or Safari (also Bitwarden, LastPass, 1Password). Duplicates are skipped, and the app offers to delete the plaintext export afterwards.
- **Password generator** — 20 characters by default, randomness from libsodium.
- **CLI for dev keys** — pipe a key into another tool, or run a command with a project's keys as environment variables, without writing a `.env` file.
- **Remember me (Windows)** — the derived key, not the password, is stored with DPAPI so only your Windows user can unlock without typing.

## Install

Requirements: Windows 10/11 and [Node.js](https://nodejs.org/) 22.6 or newer.

```bash
git clone https://github.com/liormedan/keyvault.git
cd keyvault
npm install
npm link                 # installs the `kv` command
npm run app:installer    # builds the desktop installer (needs Rust + the Tauri prerequisites)
```

The installer is written to `app/src-tauri/target/release/bundle/nsis/`. It installs for the current user only (no admin rights) and adds Start menu and desktop shortcuts.

## Command line

```bash
kv init                                   # create a vault (master password, no recovery if forgotten)
kv unlock --remember                      # remember on this Windows user, so commands don't ask
kv set my-app/API_KEY --note "prod key"   # value is typed hidden, or piped in
kv ls [project]                           # names only, never values
kv copy my-app/API_KEY                    # to the clipboard, cleared after 20 seconds
kv get my-app/API_KEY | vercel env add API_KEY production   # pipes only; refuses to print to a terminal
kv run my-app -- npm run dev              # run with the project's keys as environment variables
kv import my-app .env.local               # import an existing env file (empty values are skipped)
kv import-passwords passwords.csv --delete   # logins from a browser export; --delete removes the plaintext CSV
kv backup [dir]                           # dated encrypted copy (default: KV_BACKUP_DIR or ~/.keyvault/backups)
kv passwd                                 # change the master password
kv forget                                 # drop "remember me"
kv ui                                     # browser UI on 127.0.0.1 (if you don't use the desktop app)
kv lang <en|he>                           # interface language (also: KV_LANG)
```

Environment: `KV_LANG` — `en` or `he` (overrides `kv lang`). `KV_HOME` — vault folder (default `~/.keyvault`). `KV_BACKUP_DIR` — default backup folder. `KV_NO_OPEN=1` — `kv ui` doesn't open a browser.

## Security model

What it protects against: someone who gets the vault file (a backup, a synced folder, a stolen disk) without your master password.

- The vault file is safe to back up anywhere — without the master password it is ciphertext. Any change to it, including its header, fails decryption.
- The desktop app talks to its backend over a pipe — no port, no network. The browser UI (`kv ui`) listens on 127.0.0.1 only, with a random port and token, Host/Origin checks, and shuts down after 15 idle minutes.
- Values are never written to logs, error messages or command-line arguments.

Importing from a browser goes through the browser's own export file on purpose: keyvault never reads a browser's password database directly.

What it does **not** protect against: malware running as your user while the vault is unlocked, or anyone logged in as your Windows user when "remember me" is on. There is no master-password recovery, no sync and no browser autofill.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Development

```bash
npm run build         # esbuild: dist/cli.js, the bundled backend, app/ui/dist/
npm run typecheck     # tsc --noEmit
npm test              # node:test suites against temporary vaults — never touches ~/.keyvault
npm run app:build     # desktop app without the installer
```

Layout:

| Path | What |
|---|---|
| `src/crypto.ts` | libsodium only: Argon2id, XChaCha20-Poly1305 with the header as additional data, password generator |
| `src/store.ts` | vault file: atomic writes + `.bak`, dev keys and typed items |
| `src/types.ts` | item types — fields, which are secret, what quick-copy copies |
| `src/import-csv.ts` | password CSV import — columns matched by name |
| `src/backend.ts` | desktop backend: JSON lines over stdin/stdout |
| `src/cli.ts` | the `kv` command |
| `src/i18n.ts`, `app/ui/i18n.ts` | English and Hebrew strings — backend/CLI and the window |
| `src/dpapi.ts` | "remember me" via Windows DPAPI |
| `app/ui/` | the window (plain HTML/JS/CSS, strict CSP, no build step) |
| `app/src-tauri/` | the Tauri shell — starts the backend and relays requests; no crypto |

`npm run build` bundles the CLI (`dist/cli.js`, what `kv` runs), the backend (shipped inside the installer) and the window's scripts (`app/ui/dist/`).

## License

[MIT](LICENSE)
