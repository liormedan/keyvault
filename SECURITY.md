# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.
Report privately through GitHub: **Security → Report a vulnerability** on this repository.
Include the version or commit, what you found, and how to reproduce it. You should get a reply within a week.

## Scope

In scope:

- Anything that lets someone read vault contents without the master password or the remembered key
- Values leaking into logs, error messages, process arguments, the clipboard beyond the 20-second window, or the window's DOM after a dialog closes
- Bypassing the browser UI's protections (`kv ui`): token, Host/Origin checks, 127.0.0.1 binding
- Changes to the vault file that are not detected on decryption

Out of scope (see the security model in the README): malware running as the same user while the vault is unlocked, physical access to an unlocked session, and anyone logged in as the same Windows user when "remember me" is on.

## Design rules

- Cryptography uses libsodium primitives only — no custom crypto.
- A change to the vault file format gets a new version number and a migration; existing vaults must keep opening.
