# `kv` command reference

Everything below is the command line's public interface: commands, flags, exit codes, environment variables and the shape of `--json` output. From 1.0 on, changing any of it in an incompatible way needs a major version.

## Conventions

- **Exit codes:** `0` ok · `1` failed (including "differences found" for `kv diff` and `kv check`, and "leak found" for `kv guard`) · `2` wrong arguments.
- **Flags come before or after positional arguments**; everything after `--` belongs to the command `kv run` starts.
- **Values are never printed** to a terminal. `kv get` and `kv env` write them only into a pipe (`--show` overrides). Listings and `--json` output carry names and notes, never values.
- **The project** can be omitted wherever it's shown as `[project]`: it is read from `.kv.json` in the current folder or above.
- **Messages** go to stderr; data (values, lists, JSON) to stdout.

## Vault

| Command | |
|---|---|
| `kv init` | create a vault; asks for a master password twice |
| `kv unlock --remember` | remember the derived key in the OS secret store (DPAPI / Keychain / Secret Service) |
| `kv forget` | drop the remembered key |
| `kv passwd` | change the master password (forgets the remembered key) |
| `kv backup [dir]` | copy the encrypted file to `dir/vault_YYYY-MM-DD.kv` (default `KV_BACKUP_DIR`, else `~/.keyvault/backups`) |
| `kv export <file> [--recovery-code]` | an encrypted copy under its own password (asked twice), or under a generated recovery code printed once to stderr. Never overwrites a file |
| `kv restore <file> [--force]` | asks for the export's password or recovery code, then a new master password; writes the vault. `--force` replaces an existing vault (kept as `vault.kv.before-restore`) |
| `kv status [--json]` | `{ version, vault, exists, remembered, lang }` |
| `kv doctor` | setup checks (✓ / !) |
| `kv lang <en\|he>` | interface language, saved in `~/.keyvault/config.json` |

## Keys

| Command | |
|---|---|
| `kv set <project/KEY> [--env e] [--note "…"]` | value typed hidden, or from stdin |
| `kv get <project/KEY> [--env e] [--show]` | value to stdout |
| `kv copy <project/KEY> [--env e]` | to the clipboard, cleared after 20 s |
| `kv rm <project/KEY> [--env e]` | delete the key, or only that environment's value |
| `kv mv <from> <to>` | rename `project/KEY` → `project/KEY`, or `project` → `project` |
| `kv ls [project] [--json]` | `{ [project]: [{ key, note, updated, envs? }] }` |
| `kv import <project> <file.env>` | import an env file (empty values skipped) |
| `kv import-passwords <file> [--delete]` | a browser CSV, 1Password (`.1pux` or CSV), Bitwarden (unencrypted `.json`), KeePass (`.xml`) or LastPass export; the format is recognised from the content |
| `kv audit [--breaches] [--json]` | password health: `{ checked, reused: [[item]], weak: [{ item, reason }], old: [item], no2fa: [item], breaches?: { checked, found: [{ count, items }] } }`, where `item` is `{ id, type, title, sub, fav, updated }` and `reason` is `common`, `repeated`, `short`, `digits` or `letters`. `--breaches` is the only network call kv makes: the first 5 hex characters of each password's SHA-1 go to `api.pwnedpasswords.com` |

## Projects

| Command | |
|---|---|
| `kv init-project [name] [--env e] [--force]` | write `.kv.json` (`{ "project", "env"? }`) |
| `kv run [project] [--env e] -- <command…>` | run with the project's values as environment variables |
| `kv env [project] [--env e] [--format sh\|pwsh\|fish\|dotenv\|json] [--show]` | values for `eval` or a pipe |
| `kv example [project]` | `KEY=` lines, names only |
| `kv check [project] [--env e] [--file f]` | exit 1 and the missing names if `f` (default `.env.example`) needs keys the vault lacks |

An environment's value is used where it exists; otherwise the key's default value.

## Platforms

| Command | |
|---|---|
| `kv push <vercel\|github> [project] [--env e] [--target production\|preview\|development] [--sensitive] [--repo owner/name] [--environment name] [--dry-run]` | through `vercel` / `gh`; values on stdin |
| `kv pull vercel [project] [--env e] [--target …]` | Vercel's values into the vault |
| `kv diff <vercel\|github> [project] [--env e] [--target …] [--repo …] [--environment …] [--json]` | `{ onlyVault: [], onlyPlatform: [], changed: [], same: n }` — exit 1 if anything differs |

Vercel target from `--env`: `prod`/`production` → production, `staging`/`preview` → preview, anything else → development.

## Leaks

| Command | |
|---|---|
| `kv guard [--all] [--strict]` | stop on vault values (8+ characters) in staged lines, or all tracked files; `--strict`: also stop when the vault is locked |
| `kv guard install [--force]` / `kv guard uninstall` | the pre-commit hook |
| `kv scan [dir] [--json] [--import]` | `[{ file, kind, tracked, vars?: [{ name, filled, secret, inVault? }] }]` |

## Other

| Command | |
|---|---|
| `kv ui` | browser UI on 127.0.0.1 with a random port and token |
| `kv completion <bash\|zsh\|fish\|powershell>` | shell completion script |
| `kv --version`, `kv help` | |

## Environment

| Variable | |
|---|---|
| `KV_HOME` | vault folder (default `~/.keyvault`) |
| `KV_LANG` | `en` or `he`; overrides `kv lang` |
| `KV_BACKUP_DIR` | default folder for `kv backup` |
| `KV_NO_OPEN` | `kv ui` doesn't open a browser |
