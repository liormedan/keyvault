# Contributing

Thanks for helping. kv-vault holds people's secrets, so the bar is: small, tested, and no surprises in what leaves memory.

## Setup

```bash
git clone https://github.com/liormedan/kv-vault.git && cd kv-vault
npm install            # also builds dist/ (prepare)
npm test               # never touches ~/.keyvault — every test uses a temporary vault
npm link               # `kv` from your checkout
```

The desktop app needs Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/): `npm run app:build`, then `npm run test:e2e` drives the real window (Windows).

## Before you open a PR

```bash
npm run typecheck && npm run lint && npm test
```

CI runs the same on Windows, macOS and Linux, plus CodeQL.

- **Tests with the change.** A bug fix comes with the test that would have caught it.
- **Strings in both languages.** User-facing text goes through `t(key)` (`src/i18n.ts`) or `tr(key)` (`app/ui/i18n.ts`) — add English and Hebrew; the types fail the build if one is missing. If you don't read Hebrew, put the English text in both and say so in the PR; it will be translated before release.
- **One focused change per PR**, with a description of what and why.

## Ground rules

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. In short:

1. No custom cryptography — libsodium primitives, in `src/crypto.ts` only.
2. Values never go into command-line arguments, logs, error messages, listings or `--json` output.
3. The vault file format only grows ([docs/FORMAT.md](docs/FORMAT.md)); old vaults must keep opening (`test/fixtures/`).
4. Tests use temporary vaults (`KV_HOME`), and never the developer's clipboard or keychain (those tests run in CI only).

## Security issues

Not in public issues — see [SECURITY.md](SECURITY.md).
