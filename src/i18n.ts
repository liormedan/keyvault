// Messages for the backend and the CLI, in English (default) and Hebrew.
// Language: KV_LANG, else ~/.keyvault/config.json { "lang": "he" }, else English.
// The desktop window has its own strings (app/ui/i18n.js) and tells the backend its choice with setLang.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Lang } from "./model.ts";

export const LANGS: readonly Lang[] = ["en", "he"];
const HOME = process.env.KV_HOME || path.join(os.homedir(), ".keyvault");
const CONFIG = path.join(HOME, "config.json");

const EN = {
  "pw.empty": "Master password is empty",
  "pw.required": "Master password required",
  "pw.mismatch": "Passwords don't match",
  "pw.wrong": "Wrong master password, or the file was modified",
  "remember.stale": "The remembered key is no longer valid — master password required",
  "remember.windowsOnly": "Remember me is available on Windows only",
  "remember.unavailable": "Remember me is not available here: no system keychain. On Linux, install and unlock a Secret Service (GNOME Keyring or KWallet).",
  "vault.none": "No vault at {path}. Run: kv init",
  "vault.exists": "A vault already exists at {path}",
  "kdf.unknown": "Unknown algorithm: {alg}",
  "ref.invalid": 'Invalid name: "{ref}". Use project/KEY, e.g. my-app/API_KEY',
  "entry.notFound": "Not found: {ref}",
  "entry.missing": "Missing project, name or value (no / in the project name)",
  "guard.hookExists": "{path} already exists and isn't kv's — add `kv guard || exit 1` to it yourself, or use --force to replace it",
  "guard.installed": "Installed the pre-commit hook: {path}. Commits that contain a vault value will be stopped.",
  "guard.uninstalled": "Removed the kv pre-commit hook: {path}",
  "guard.notInstalled": "No kv pre-commit hook here",
  "guard.clean": "kv guard: no vault values in {what} ({n} lines checked)",
  "guard.found": "kv guard: {n} vault value(s) found — the commit is stopped:",
  "guard.foundAll": "kv guard: {n} vault value(s) found in tracked files:",
  "guard.foundLine": "  {file}:{line}  {name}",
  "guard.hint": "Move them out (kv run / kv env), or remove them from the commit. To skip once: git commit --no-verify",
  "guard.locked": "kv guard: skipped — the vault is locked (run kv unlock --remember so the hook can check). Use --strict to block instead.",
  "guard.staged": "the staged changes",
  "guard.tracked": "tracked files",
  "scan.none": "No .env or key files found under {dir}",
  "scan.title": "{n} files with keys under {dir}{note}",
  "scan.locked": " (vault locked — can't tell what's already in it; run kv unlock --remember)",
  "scan.tracked": "IN GIT",
  "scan.template": "template",
  "scan.inVault": "in vault: {where}",
  "scan.notInVault": "not in the vault",
  "scan.imported": "Imported {n} values into {project}: {names}",
  "scan.importNone": "Nothing new to import",
  "doctor.title": "kv doctor",
  "doctor.node": "Node.js {version}",
  "doctor.nodeOld": "Node.js {version} — kv needs 22.6 or newer",
  "doctor.vault": "Vault at {path}",
  "doctor.noVault": "No vault yet — run kv init",
  "doctor.perms": "The vault file is readable by other users ({mode}) — chmod 600 {path}",
  "doctor.remembered": "Remembered on this computer",
  "doctor.notRemembered": "Not remembered — kv asks for the master password each time (kv unlock --remember)",
  "doctor.backup": "Last backup {days} days ago ({path})",
  "doctor.noBackup": "No backup in {dir} — run kv backup",
  "doctor.oldBackup": "Last backup {days} days ago — run kv backup",
  "doctor.project": "This folder is project {project} ({n} keys)",
  "doctor.projectMissing": ".kv.json says {project}, which isn't in the vault",
  "doctor.noProject": "No .kv.json here (kv init-project)",
  "doctor.guard": "kv guard pre-commit hook installed in this repository",
  "doctor.noGuard": "No kv guard hook in this repository (kv guard install)",
  "doctor.stale": "{n} keys not updated for over a year: {names}",
  "cli.usage.guard": "Usage: kv guard [--all] [--strict]   ·   kv guard install [--force]   ·   kv guard uninstall",
  "push.unsafeArg": "Refusing to pass {arg} to a platform CLI (only names, targets and repo names are allowed)",
  "push.noTool": "{tool} is not installed or not on PATH",
  "push.badTarget": "Unknown Vercel target {target}: use production, preview or development",
  "push.badName": "{name} is not a valid environment variable name for a platform",
  "push.failed": "{tool} failed {name}: {reason}",
  "push.done": "Pushed {n} keys from {project} to {platform}{where}: {names}",
  "push.dryRun": "Would push {n} keys from {project} to {platform}{where}: {names}",
  "pull.done": "Pulled {n} keys from Vercel ({target}) into {project}{env}: {names}",
  "pull.githubNo": "GitHub secrets can't be read back — pull works with Vercel only",
  "diff.title": "{project}{env} ↔ {platform}{where}",
  "diff.onlyVault": "only in the vault",
  "diff.onlyPlatform": "only on {platform}",
  "diff.changed": "different value",
  "diff.same": "{n} the same",
  "diff.namesOnly": "(GitHub can't show values — names only)",
  "cli.usage.push":
    "Usage: kv push <vercel|github> [project] [--env e] [--target production|preview|development] [--sensitive] [--repo owner/name] [--environment name] [--dry-run]",
  "cli.usage.pull": "Usage: kv pull vercel [project] [--env e] [--target production|preview|development]",
  "cli.usage.diff": "Usage: kv diff <vercel|github> [project] [--env e] [--target …] [--repo owner/name] [--environment name]",
  "entry.noValue": "{ref} has no value for {env}",
  "entry.exists": "{ref} already exists",
  "project.exists": "Project {name} already exists",
  "project.badFile": '{path} is not a valid kv project file — it needs {"project": "name"}',
  "project.fileExists": "{path} already exists (--force replaces it)",
  "project.none": "No project here: no .kv.json in this folder or above. Run kv init-project, or name the project.",
  "cli.projectCreated": "Created {path} → project {name}. It holds only the name, so it is safe to commit.",
  "cli.usage.mv": "Usage: kv mv <project/KEY> <project/KEY>   or   kv mv <project> <project>",
  "cli.moved": "Moved {from} → {to}",
  "cli.checkOk": "All {n} keys in {file} are in the vault ({project}).",
  "cli.checkMissing": "Missing from the vault ({project}{env}): {names}",
  "cli.envNoTty": 'kv env prints values: pipe or eval it, e.g. eval "$(kv env)" (or --show)',
  "cli.usage.format": "Unknown --format {format}: use sh, pwsh, fish, dotenv or json",
  "item.notFound": "Item not found",
  "item.fieldEmpty": "The field is empty",
  "item.unknownType": "Unknown type: {type}",
  "item.noTitle": "Title is required",
  "item.tooLong": "{field}: too long",
  "import.noFile": "No file to delete",
  "import.notFound": "File not found",
  "import.notFile": "Not a file",
  "import.tooBig": "File too large (over 20 MB)",
  "import.empty": "The file is empty or not a password CSV",
  "import.columns": "Expected columns not found (password, and url or name). Is this a browser password export?",
  "import.untitled": "(untitled)",
  "import.unknown": "Unknown file format. Supported: a browser CSV, 1Password (.1pux or CSV), Bitwarden (.json), KeePass (.xml) and LastPass (CSV)",
  "import.encrypted": 'This export is encrypted. Export again without a password (Bitwarden: "JSON", not "JSON (Encrypted)")',
  "import.badZip": "The .1pux file is damaged or is not a 1Password export",
  "import.extraFields": "{title} — extra fields",
  "totp.invalid": "The two-factor key is not a valid base32 secret or otpauth:// link",
  "totp.notTotp": "Only time-based codes (otpauth://totp/…) are supported",
  "totp.none": "This item has no two-factor key",
  "breach.failed": "Could not reach api.pwnedpasswords.com ({reason})",
  "export.exists": "{path} already exists — choose another name",
  "export.notExport": "{path} is not a kv-vault export",
  "restore.exists": "A vault already exists at {path}. Use --force to replace it (the current one is kept as vault.kv.before-restore)",
  "browser.noHost": "The browser host isn't built here (host.mjs / host.js missing). Run npm run build, or reinstall kv-vault.",
  "browser.on": "Browser extension: on — registered with {browsers}.",
  "browser.off": "Browser extension: off. Turn it on with: kv browser enable",
  "browser.load": "Load the extension: chrome://extensions or edge://extensions → Developer mode → Load unpacked → {dir}",
  "cli.usage.browser": "Usage: kv browser [status|enable|disable] [--json]",
  "sync.conflictTitle": "{title} (conflict {date})",
  "sync.unreadable": "{file} in the sync folder isn't a kv-vault file",
  "sync.folderGone": "The sync folder isn't reachable: {folder}",
  "sync.notFolder": "Not a folder: {folder}",
  "sync.busy": "Another kv-vault process is syncing right now — try again in a moment",
  "sync.off": "Sync is off. Choose a folder first",
  "sync.otherVault": "The sync folder holds a vault with a different master password. Link the folder again to join it.",
  "share.badKey": "That isn't a kv-vault sharing key (kvpk1.…). Ask for it again — it may be cut off",
  "share.notShare": "Not a kv-vault share file",
  "share.notForYou": "This share file was made for someone else's sharing key",
  "share.noItem": "No item titled “{title}”",
  "share.manyItems": "{n} items are titled “{title}” — use the id: {ids}",
  "cli.usage.sync": "Usage: kv sync [now|status|off] [--json]   ·   kv sync link <folder>",
  "cli.usage.share": "Usage: kv share key   ·   kv share <project/KEY ...> --to <key> [--out file]   ·   kv share --item <title|id> --to <key> [--out file]",
  "cli.usage.receive": "Usage: kv receive <file.kvshare>",
  "cli.sync.done": "Synced with {folder}{conflicts}",
  "cli.sync.conflicts": " — {n} conflicts kept as “(conflict …)” copies",
  "cli.sync.created": "Sync is on: the vault was copied to {folder}. Link the same folder on your other computers.",
  "cli.sync.joined": "Joined the vault in {folder}. This computer now uses that vault's master password.",
  "cli.sync.off": "Sync is off. The files in the folder were left as they are.",
  "cli.sync.status": "Sync folder: {folder}\nLast sync: {last}",
  "cli.sync.never": "never",
  "cli.sync.none": "Sync is off. Turn it on with: kv sync link <folder in Drive / Dropbox / OneDrive>",
  "cli.prompt.otherVault": "The folder holds another vault. Its master password: ",
  "cli.share.key": "Your sharing key — send it to people who want to send you items (it's public; it can't open anything):\n\n  {key}",
  "cli.share.done": "Sealed for that key: {file}\nSend the file any way you like. Only the vault with that sharing key can open it.",
  "cli.received": "Added {items} items and {dev} dev keys{skipped}.",
  "cli.receivedSkipped": " ({n} already here, skipped)",
  "weak.common": "very common",
  "weak.repeated": "one repeated character",
  "weak.short": "shorter than 8 characters",
  "weak.digits": "digits only",
  "weak.letters": "letters only",
  "op.unknown": "Unknown action: {name}",
  "tty.none": "No terminal to type a password. Run first: kv unlock --remember",
  cancelled: "Cancelled",
  "clipboard.unavailable": "Could not copy: {tool} failed ({reason}). On Linux install wl-clipboard (Wayland) or xclip (X11).",
  "lang.invalid": "Unknown language: {lang}. Use: en, he",

  "cli.help": `kv — kv-vault, a local vault for development keys

  kv init                          create a new vault (master password)
  kv set  <project/KEY> [--env e] [--note "..."]   add or update. The value is typed hidden, or piped in
  kv get  <project/KEY>            write the value to stdout — pipes only (kv get x | vercel env add ...)
  kv copy <project/KEY>            copy to the clipboard, cleared after 20 seconds
  kv ls   [project]                list names, never values
  kv rm   <project/KEY>            delete
  kv run  [project] [--env e] -- <command>   run with the project's keys as environment variables
                                   (no project: taken from .kv.json in this folder or above)
  kv env  [project] [--env e] [--format sh|pwsh|fish|dotenv|json]   values for eval or a pipe
  kv init-project [name] [--env e]  write .kv.json here (names only — safe to commit)
  kv example [project]             .env.example from the vault (names only)
  kv check [project] [--file f] [--env e]   which keys in .env.example are missing
  kv mv <from> <to>                rename a key (project/KEY) or a project
  kv push <vercel|github> [project] [--env e]   send the project's keys (values via stdin)
  kv pull vercel [project] [--env e]            bring Vercel's values into the vault
  kv diff <vercel|github> [project] [--env e]   what differs (names only, never values)
  kv guard [--all] | install | uninstall       stop commits that contain a vault value
  kv scan [dir] [--json] [--import]            find .env and key files; what's already in the vault
  kv doctor                                    check the setup
  kv import <project> <file.env>   import an env file
  kv import-passwords <file> [--delete]   import from a browser CSV, 1Password, Bitwarden, KeePass or LastPass export
  kv audit [--breaches] [--json]   reused, weak and old passwords; --breaches: check known breaches (hash prefixes only)
  kv browser [status|enable|disable]   connect the kv-vault browser extension (off until enabled)
  kv sync link <folder> | now | status | off   sync through a folder you already sync (Drive, Dropbox, OneDrive)
  kv share key | <project/KEY> --to <key> | --item <title> --to <key>   seal items for one person (.kvshare file)
  kv receive <file.kvshare>        add what someone shared with you
  kv ui                            browser window to view, search and edit (local only)
  kv unlock --remember             remember the vault for this Windows user (no password each time)
  kv forget                        drop the remembered key
  kv backup [dir]                  dated encrypted copy (default: KV_BACKUP_DIR, or backups next to the vault)
  kv passwd                        change the master password
  kv export <file> [--recovery-code]   encrypted emergency copy with its own password (or a printed recovery code)
  kv restore <file> [--force]      make a vault from an export, with a new master password
  kv lang <en|he>                  interface language
  kv status [--json]               version, vault path, remembered, language
  kv completion <shell>            shell completion (bash, zsh, fish, powershell)

  --json on ls and status prints machine-readable output (names only, never values).
  Exit codes: 0 ok · 1 failed · 2 wrong arguments.

Vault: {vault}`,
  "cli.prompt.password": "Master password: ",
  "cli.prompt.current": "Current master password: ",
  "cli.prompt.new": "New master password: ",
  "cli.prompt.again": "Again, to confirm: ",
  "cli.prompt.value": "Value for {ref}: ",
  "cli.created": "Vault created: {path}",
  "cli.noRecovery": "A forgotten master password cannot be recovered — keep it somewhere safe.",
  "cli.valueEmpty": "Empty value — not saved",
  "cli.saved": "Saved: {ref}",
  "cli.noShow": "Values are not printed to the screen. Use kv copy, or a pipe: kv get x | ...  (or --show)",
  "cli.copied": "Copied {ref} — the clipboard clears in 20 seconds",
  "cli.noProject": "No project {name}",
  "cli.empty": "The vault is empty. Add: kv set project/KEY",
  "cli.deleted": "Deleted: {ref}",
  "cli.usage.run": "Usage: kv run <project> -- <command>",
  "cli.usage.import": "Usage: kv import <project> <file.env>",
  "cli.usage.importPasswords": "Usage: kv import-passwords <file> [--delete]",
  "cli.usage.audit": "Usage: kv audit [--breaches] [--json]",
  "cli.usage.unlock": "Usage: kv unlock --remember",
  "cli.usage.lang": "Usage: kv lang <en|he>",
  "cli.usage.completion": "Usage: kv completion <bash|zsh|fish|powershell>",
  "cli.status.vault": "Vault",
  "cli.status.none": "not created yet — run kv init",
  "cli.status.remembered": "Remembered on this computer",
  "cli.status.yes": "yes",
  "cli.status.no": "no",
  "cli.status.lang": "Language",
  "cli.importedFrom": "imported from {file}",
  "cli.imported": "Imported {n} keys into {project}: {names}",
  "cli.skippedEmpty": "Skipped (empty in the file): {names}",
  "cli.fileStillThere": "The original file is still on disk — delete it if you don't need it.",
  "cli.importedItems": "{format}: added {added} items. Duplicates skipped: {duplicates}. Skipped (no password or empty): {skipped}.",
  "cli.importDeleted": "The export file was deleted.",
  "cli.importPlain": "The export file holds the passwords in plain text — delete it (or run with --delete).",
  "cli.prompt.exportPw": "Password for the export (not your master password): ",
  "cli.prompt.fileSecret": "Password or recovery code of {file}: ",
  "cli.exported": "Exported (encrypted): {path}\nIt opens with the password you just chose, not with the master password. Restore with: kv restore <file>",
  "cli.recoveryCode":
    "Exported (encrypted): {path}\n\nRecovery code — write it down or print it. It is shown only this once:\n\n    {code}\n\nThe file is a snapshot of the vault as it is now. Keep it away from this computer (a USB stick, and the code printed in a drawer).\nRestore with: kv restore <file>",
  "cli.restored": "Restored into {path} with the new master password. Run kv unlock --remember if you used remember me.",
  "cli.usage.export": "Usage: kv export <file> [--recovery-code]",
  "cli.usage.restore": "Usage: kv restore <file> [--force]",
  "audit.title": "Password health — {n} passwords checked",
  "audit.reused": "Reused — the same password on several items ({n} groups):",
  "audit.weak": "Weak ({n}):",
  "audit.old": "Not changed for over a year ({n}):",
  "audit.no2fa": "Logins without a two-factor key: {n}",
  "audit.clean": "No reused, weak or old passwords.",
  "audit.breaches": "Found in known breaches ({n}) — change these first:",
  "audit.breachesNone": "None of the {n} passwords appear in known breaches.",
  "audit.breachNote": "Only the first 5 characters of each password's SHA-1 hash were sent to api.pwnedpasswords.com.",
  "audit.seen": "seen {count} times",
  "audit.more": "  … and {n} more",
  "cli.remembered": "Remembered for this user on this computer (DPAPI). To undo: kv forget",
  "cli.forgotten": "Remembered key removed — the master password will be required",
  "cli.backedUp": "Backed up (encrypted): {path}",
  "cli.passwdChanged": "Master password changed. If you used remember me, run kv unlock --remember again",
  "cli.unknownCommand": "Unknown command: {cmd}. Run kv help",
  "cli.langSet": "Language: English",

  "ui.idle": "shut down after 15 idle minutes",
  "ui.locked": "locked from the window",
  "ui.closed": "closed",
  "ui.tooBig": "Too large",
  "ui.open": "kv ui: open at {url}\n      Ctrl+C to close. Shuts down by itself after 15 idle minutes.",
  "web.title": "kv-vault",
  "web.search": "Search projects or keys",
  "web.searchLabel": "Search",
  "web.add": "Add key",
  "web.edit": "Edit key",
  "web.lock": "Lock",
  "web.project": "Project",
  "web.keyName": "Key name",
  "web.value": "Value",
  "web.note": "Note (optional)",
  "web.notePlaceholder": "What it's for",
  "web.cancel": "Cancel",
  "web.save": "Save",
  "web.gone": "The window closed or the link is no longer valid. Run again: kv ui",
  "web.noResults": "No results",
  "web.empty": "The vault is empty — add a first key",
  "web.show": "Show",
  "web.hide": "Hide",
  "web.copy": "Copy",
  "web.copied": "Copied — the clipboard clears in 20 seconds",
  "web.editBtn": "Edit",
  "web.delete": "Delete",
  "web.confirmDelete": "Delete {ref}?",
  "web.deleted": "Deleted",
  "web.newValue": "New value",
  "web.saved": "Saved",
  "web.lockedNow": "The vault is locked. You can close the window.",
};

export type MessageKey = keyof typeof EN;

// Hebrew must cover every English key — a missing one fails to compile
const HE: Record<MessageKey, string> = {
  "pw.empty": "סיסמת אב ריקה",
  "pw.required": "נדרשת סיסמת אב",
  "pw.mismatch": "הסיסמאות לא תואמות",
  "pw.wrong": "סיסמת אב שגויה, או שהקובץ שונה",
  "remember.stale": "הזכירה לא תקפה יותר — נדרשת סיסמת אב",
  "remember.windowsOnly": "זכירה זמינה רק ב-Windows",
  "remember.unavailable": "זכירה לא זמינה כאן: אין מחזיק מפתחות של המערכת. ב-Linux צריך Secret Service פעיל (GNOME Keyring או KWallet).",
  "vault.none": "אין כספת ב-{path}. הרץ: kv init",
  "vault.exists": "כבר קיימת כספת ב-{path}",
  "kdf.unknown": "אלגוריתם לא מוכר: {alg}",
  "ref.invalid": 'שם לא תקין: "{ref}". הצורה: פרויקט/מפתח, למשל my-app/API_KEY',
  "entry.notFound": "לא נמצא: {ref}",
  "entry.missing": "חסר פרויקט, שם או ערך (בלי / בשם הפרויקט)",
  "guard.hookExists": "{path} כבר קיים ואינו של kv — הוסף אליו בעצמך `kv guard || exit 1`, או ‎--force כדי להחליף",
  "guard.installed": "הותקן pre-commit hook: {path}. קומיט שמכיל ערך מהכספת ייעצר.",
  "guard.uninstalled": "הוסר ה-hook של kv: {path}",
  "guard.notInstalled": "אין כאן hook של kv",
  "guard.clean": "kv guard: אין ערכים מהכספת ב{what} (נבדקו {n} שורות)",
  "guard.found": "kv guard: נמצאו {n} ערכים מהכספת — הקומיט נעצר:",
  "guard.foundAll": "kv guard: נמצאו {n} ערכים מהכספת בקבצים שבגיט:",
  "guard.foundLine": "  {file}:{line}  {name}",
  "guard.hint": "הוצא אותם (kv run / kv env) או הסר אותם מהקומיט. לדלג פעם אחת: git commit --no-verify",
  "guard.locked": "kv guard: דולג — הכספת נעולה (הרץ kv unlock --remember כדי שה-hook יוכל לבדוק). ‎--strict כדי לחסום במקום.",
  "guard.staged": "שינויים שב-stage",
  "guard.tracked": "קבצים שבגיט",
  "scan.none": "לא נמצאו קובצי .env או מפתחות תחת {dir}",
  "scan.title": "{n} קבצים עם מפתחות תחת {dir}{note}",
  "scan.locked": " (הכספת נעולה — אי אפשר לדעת מה כבר בה; הרץ kv unlock --remember)",
  "scan.tracked": "בגיט",
  "scan.template": "תבנית",
  "scan.inVault": "בכספת: {where}",
  "scan.notInVault": "לא בכספת",
  "scan.imported": "יובאו {n} ערכים ל-{project}: {names}",
  "scan.importNone": "אין מה לייבא",
  "doctor.title": "kv doctor",
  "doctor.node": "Node.js {version}",
  "doctor.nodeOld": "Node.js {version} — kv צריך 22.6 ומעלה",
  "doctor.vault": "כספת ב-{path}",
  "doctor.noVault": "אין עדיין כספת — הרץ kv init",
  "doctor.perms": "קובץ הכספת קריא למשתמשים אחרים ({mode}) — chmod 600 {path}",
  "doctor.remembered": "זכורה במחשב הזה",
  "doctor.notRemembered": "לא זכורה — kv מבקש סיסמת אב בכל פעם (kv unlock --remember)",
  "doctor.backup": "גיבוי אחרון לפני {days} ימים ({path})",
  "doctor.noBackup": "אין גיבוי ב-{dir} — הרץ kv backup",
  "doctor.oldBackup": "גיבוי אחרון לפני {days} ימים — הרץ kv backup",
  "doctor.project": "התיקייה הזו היא הפרויקט {project} ({n} מפתחות)",
  "doctor.projectMissing": ".kv.json מצביע על {project}, שלא קיים בכספת",
  "doctor.noProject": "אין כאן .kv.json (kv init-project)",
  "doctor.guard": "ה-hook של kv guard מותקן במאגר הזה",
  "doctor.noGuard": "אין hook של kv guard במאגר הזה (kv guard install)",
  "doctor.stale": "{n} מפתחות לא עודכנו יותר משנה: {names}",
  "cli.usage.guard": "שימוש: kv guard [--all] [--strict]   ·   kv guard install [--force]   ·   kv guard uninstall",
  "push.unsafeArg": "לא מעביר את {arg} לכלי של הפלטפורמה (מותרים רק שמות, יעדים ושמות מאגר)",
  "push.noTool": "{tool} לא מותקן או לא נמצא ב-PATH",
  "push.badTarget": "יעד Vercel לא מוכר: {target}. אפשר production, preview או development",
  "push.badName": "{name} אינו שם תקין למשתנה סביבה בפלטפורמה",
  "push.failed": "{tool} נכשל {name}: {reason}",
  "push.done": "נדחפו {n} מפתחות מ-{project} ל-{platform}{where}: {names}",
  "push.dryRun": "יידחפו {n} מפתחות מ-{project} ל-{platform}{where}: {names}",
  "pull.done": "נמשכו {n} מפתחות מ-Vercel ({target}) אל {project}{env}: {names}",
  "pull.githubNo": "אי אפשר לקרוא בחזרה סודות של GitHub — משיכה עובדת רק עם Vercel",
  "diff.title": "{project}{env} ↔ {platform}{where}",
  "diff.onlyVault": "רק בכספת",
  "diff.onlyPlatform": "רק ב-{platform}",
  "diff.changed": "ערך שונה",
  "diff.same": "{n} זהים",
  "diff.namesOnly": "(GitHub לא מציג ערכים — שמות בלבד)",
  "cli.usage.push":
    "שימוש: kv push <vercel|github> [פרויקט] [--env e] [--target production|preview|development] [--sensitive] [--repo owner/name] [--environment name] [--dry-run]",
  "cli.usage.pull": "שימוש: kv pull vercel [פרויקט] [--env e] [--target production|preview|development]",
  "cli.usage.diff": "שימוש: kv diff <vercel|github> [פרויקט] [--env e] [--target …] [--repo owner/name] [--environment name]",
  "entry.noValue": "ל-{ref} אין ערך ל-{env}",
  "entry.exists": "{ref} כבר קיים",
  "project.exists": "הפרויקט {name} כבר קיים",
  "project.badFile": '{path} אינו קובץ פרויקט תקין — צריך {"project": "name"}',
  "project.fileExists": "{path} כבר קיים (‎--force מחליף אותו)",
  "project.none": "אין כאן פרויקט: אין .kv.json בתיקייה הזו או מעליה. הרץ kv init-project, או ציין את שם הפרויקט.",
  "cli.projectCreated": "נוצר {path} ← פרויקט {name}. יש בו רק את השם, אז בטוח להכניס אותו לגיט.",
  "cli.usage.mv": "שימוש: kv mv <פרויקט/מפתח> <פרויקט/מפתח>   או   kv mv <פרויקט> <פרויקט>",
  "cli.moved": "הועבר {from} ← {to}",
  "cli.checkOk": "כל {n} המפתחות ב-{file} נמצאים בכספת ({project}).",
  "cli.checkMissing": "חסרים בכספת ({project}{env}): {names}",
  "cli.envNoTty": 'kv env מדפיס ערכים: העבר אותו בצינור או ב-eval, למשל eval "$(kv env)" (או ‎--show)',
  "cli.usage.format": "‎--format לא מוכר: {format}. אפשר sh, pwsh, fish, dotenv או json",
  "item.notFound": "הפריט לא נמצא",
  "item.fieldEmpty": "השדה ריק",
  "item.unknownType": "סוג לא מוכר: {type}",
  "item.noTitle": "חסרה כותרת",
  "item.tooLong": "{field}: ארוך מדי",
  "import.noFile": "אין קובץ למחיקה",
  "import.notFound": "הקובץ לא נמצא",
  "import.notFile": "זה לא קובץ",
  "import.tooBig": "הקובץ גדול מדי (מעל 20MB)",
  "import.empty": "הקובץ ריק או שאינו קובץ CSV של סיסמאות",
  "import.columns": "לא נמצאו העמודות הצפויות (password, ו-url או name). זה קובץ ייצוא סיסמאות מדפדפן?",
  "import.untitled": "(ללא שם)",
  "import.unknown": "סוג קובץ לא מוכר. נתמכים: CSV מדפדפן, 1Password (‏.1pux או CSV), Bitwarden (‏.json), KeePass (‏.xml) ו-LastPass (CSV)",
  "import.encrypted": 'קובץ הייצוא מוצפן. יש לייצא שוב בלי סיסמה (ב-Bitwarden: "JSON", לא "JSON (Encrypted)")',
  "import.badZip": "קובץ ה-‎.1pux פגום או שאינו ייצוא של 1Password",
  "import.extraFields": "{title} — שדות נוספים",
  "totp.invalid": "מפתח האימות הדו-שלבי אינו סוד base32 או קישור otpauth://‎ תקין",
  "totp.notTotp": "נתמכים רק קודים מבוססי זמן (otpauth://totp/…‎)",
  "totp.none": "לפריט הזה אין מפתח אימות דו-שלבי",
  "breach.failed": "אין חיבור ל-api.pwnedpasswords.com ‏({reason})",
  "export.exists": "{path} כבר קיים — בחר שם אחר",
  "export.notExport": "{path} אינו קובץ ייצוא של kv-vault",
  "restore.exists": "כבר יש כספת ב-{path}. הוסף --force כדי להחליף אותה (הנוכחית תישמר בשם vault.kv.before-restore)",
  "browser.noHost": "רכיב החיבור לדפדפן לא נבנה כאן (חסר host.mjs / host.js). הרץ npm run build, או התקן את kv-vault מחדש.",
  "browser.on": "תוסף הדפדפן: פעיל — רשום ב-{browsers}.",
  "browser.off": "תוסף הדפדפן: כבוי. להפעלה: kv browser enable",
  "browser.load": "טעינת התוסף: chrome://extensions או edge://extensions ← מצב מפתח ← Load unpacked ← {dir}",
  "cli.usage.browser": "שימוש: kv browser [status|enable|disable] [--json]",
  "sync.conflictTitle": "{title} (התנגשות {date})",
  "sync.unreadable": "{file} בתיקיית הסנכרון אינו קובץ של kv-vault",
  "sync.folderGone": "אין גישה לתיקיית הסנכרון: {folder}",
  "sync.notFolder": "זו לא תיקייה: {folder}",
  "sync.busy": "תהליך אחר של kv-vault מסנכרן עכשיו — נסה שוב עוד רגע",
  "sync.off": "הסנכרון כבוי. בחר תיקייה קודם",
  "sync.otherVault": "בתיקיית הסנכרון יש כספת עם סיסמת אב אחרת. קשר את התיקייה שוב כדי להצטרף אליה.",
  "share.badKey": "זה לא מפתח שיתוף של kv-vault ‏(kvpk1.…). בקש אותו שוב — אולי הוא נחתך",
  "share.notShare": "זה לא קובץ שיתוף של kv-vault",
  "share.notForYou": "קובץ השיתוף הזה נוצר למפתח שיתוף של מישהו אחר",
  "share.noItem": "אין פריט בשם ״{title}״",
  "share.manyItems": "{n} פריטים בשם ״{title}״ — השתמש במזהה: {ids}",
  "cli.usage.sync": "שימוש: kv sync [now|status|off] [--json]   ·   kv sync link <תיקייה>",
  "cli.usage.share": "שימוש: kv share key   ·   kv share <פרויקט/מפתח ...> --to <מפתח> [--out קובץ]   ·   kv share --item <שם|מזהה> --to <מפתח> [--out קובץ]",
  "cli.usage.receive": "שימוש: kv receive <קובץ.kvshare>",
  "cli.sync.done": "סונכרן עם {folder}{conflicts}",
  "cli.sync.conflicts": " — {n} התנגשויות נשמרו כעותקים ״(התנגשות …)״",
  "cli.sync.created": "הסנכרון פעיל: הכספת הועתקה אל {folder}. קשר את אותה תיקייה במחשבים האחרים שלך.",
  "cli.sync.joined": "הצטרפת לכספת שב-{folder}. מעכשיו המחשב הזה משתמש בסיסמת האב שלה.",
  "cli.sync.off": "הסנכרון כבוי. הקבצים בתיקייה נשארו כמו שהם.",
  "cli.sync.status": "תיקיית סנכרון: {folder}\nסנכרון אחרון: {last}",
  "cli.sync.never": "אף פעם",
  "cli.sync.none": "הסנכרון כבוי. להפעלה: kv sync link <תיקייה ב-Drive / Dropbox / OneDrive>",
  "cli.prompt.otherVault": "בתיקייה יש כספת אחרת. סיסמת האב שלה: ",
  "cli.share.key": "מפתח השיתוף שלך — שלח אותו למי שרוצה לשלוח לך פריטים (הוא ציבורי; אי אפשר לפתוח איתו כלום):\n\n  {key}",
  "cli.share.done": "נחתם למפתח הזה: {file}\nשלח את הקובץ בכל דרך. רק הכספת עם מפתח השיתוף הזה יכולה לפתוח אותו.",
  "cli.received": "נוספו {items} פריטים ו-{dev} מפתחות פיתוח{skipped}.",
  "cli.receivedSkipped": " ({n} כבר היו, דולגו)",
  "weak.common": "נפוצה מאוד",
  "weak.repeated": "תו אחד שחוזר",
  "weak.short": "קצרה מ-8 תווים",
  "weak.digits": "ספרות בלבד",
  "weak.letters": "אותיות בלבד",
  "op.unknown": "פעולה לא מוכרת: {name}",
  "tty.none": "אין טרמינל להקלדת סיסמה. הרץ קודם: kv unlock --remember",
  cancelled: "בוטל",
  "clipboard.unavailable": "ההעתקה נכשלה: {tool} ({reason}). ב-Linux צריך להתקין wl-clipboard (Wayland) או xclip (X11).",
  "lang.invalid": "שפה לא מוכרת: {lang}. אפשר: en, he",

  "cli.help": `kv — כספת מקומית למפתחות

  kv init                        יצירת כספת חדשה (סיסמת אב)
  kv set  <פרויקט/מפתח> [--env e] [--note "..."]   הוספה/עדכון. הערך מוקלד מוסתר, או מגיע מצינור
  kv get  <פרויקט/מפתח>          כתיבת הערך ל-stdout — רק לצינור (kv get x | vercel env add ...)
  kv copy <פרויקט/מפתח>          העתקה ללוח, נמחק אחרי 20 שניות
  kv ls   [פרויקט]               רשימת שמות, בלי ערכים
  kv rm   <פרויקט/מפתח>          מחיקה
  kv run  [פרויקט] [--env e] -- <פקודה>   הרצה עם מפתחות הפרויקט כמשתני סביבה
                                 (בלי פרויקט: מתוך .kv.json בתיקייה הזו או מעליה)
  kv env  [פרויקט] [--env e] [--format sh|pwsh|fish|dotenv|json]   ערכים ל-eval או לצינור
  kv init-project [שם] [--env e]  יוצר .kv.json כאן (שמות בלבד — בטוח לגיט)
  kv example [פרויקט]            ‎.env.example מהכספת (שמות בלבד)
  kv check [פרויקט] [--file f] [--env e]   אילו מפתחות מ-.env.example חסרים
  kv mv <מ> <ל>                  שינוי שם למפתח (פרויקט/מפתח) או לפרויקט
  kv push <vercel|github> [פרויקט] [--env e]   שליחת מפתחות הפרויקט (ערכים דרך stdin)
  kv pull vercel [פרויקט] [--env e]            משיכת הערכים מ-Vercel לכספת
  kv diff <vercel|github> [פרויקט] [--env e]   מה שונה (שמות בלבד, אף פעם לא ערכים)
  kv guard [--all] | install | uninstall       חוסם קומיט שמכיל ערך מהכספת
  kv scan [תיקייה] [--json] [--import]         מוצא קובצי .env ומפתחות; מה כבר בכספת
  kv doctor                                    בדיקת ההתקנה
  kv import <פרויקט> <קובץ.env>  ייבוא מקובץ env
  kv import-passwords <קובץ> [--delete]   ייבוא מ-CSV של דפדפן, 1Password, ‏Bitwarden, ‏KeePass או LastPass
  kv audit [--breaches] [--json]   סיסמאות חוזרות, חלשות וישנות; ‎--breaches: בדיקת דליפות (רק תחילית של hash)
  kv browser [status|enable|disable]   חיבור תוסף הדפדפן של kv-vault (כבוי עד שמפעילים)
  kv sync link <תיקייה> | now | status | off   סנכרון דרך תיקייה שכבר מסונכרנת (Drive, Dropbox, OneDrive)
  kv share key | <פרויקט/מפתח> --to <מפתח> | --item <שם> --to <מפתח>   חתימת פריטים לאדם אחד (קובץ ‎.kvshare)
  kv receive <קובץ.kvshare>      הוספת מה ששיתפו איתך
  kv ui                          חלון לצפייה, חיפוש ועריכה (נפתח בדפדפן, מקומי בלבד)
  kv unlock --remember           זכירת הכספת למשתמש הזה ב-Windows (בלי להקליד סיסמה כל פעם)
  kv forget                      ביטול הזכירה
  kv backup [תיקייה]             עותק מוצפן עם תאריך (ברירת מחדל: KV_BACKUP_DIR, או backups ליד הכספת)
  kv passwd                      החלפת סיסמת אב
  kv export <קובץ> [--recovery-code]   עותק חירום מוצפן בסיסמה משלו (או בקוד שחזור להדפסה)
  kv restore <קובץ> [--force]    כספת מקובץ ייצוא, עם סיסמת אב חדשה
  kv lang <en|he>                שפת הממשק
  kv status [--json]             גרסה, מיקום הכספת, זכירה, שפה
  kv completion <shell>          השלמה אוטומטית (bash, zsh, fish, powershell)

  --json ב-ls וב-status מדפיס פלט למכונה (שמות בלבד, אף פעם לא ערכים).
  קודי יציאה: 0 הצליח · 1 נכשל · 2 ארגומנטים שגויים.

הכספת: {vault}`,
  "cli.prompt.password": "סיסמת אב: ",
  "cli.prompt.current": "סיסמת אב נוכחית: ",
  "cli.prompt.new": "סיסמת אב חדשה: ",
  "cli.prompt.again": "שוב, לאימות: ",
  "cli.prompt.value": "ערך ל-{ref}: ",
  "cli.created": "נוצרה כספת: {path}",
  "cli.noRecovery": "אין דרך לשחזר סיסמת אב שנשכחה — כדאי לרשום אותה במקום בטוח.",
  "cli.valueEmpty": "ערך ריק — לא נשמר",
  "cli.saved": "נשמר: {ref}",
  "cli.noShow": "לא מציג ערכים על המסך. השתמש ב-kv copy, או בצינור: kv get x | ...  (או --show)",
  "cli.copied": "הועתק {ref} — הלוח יתנקה בעוד 20 שניות",
  "cli.noProject": "אין פרויקט {name}",
  "cli.empty": "הכספת ריקה. הוסף: kv set פרויקט/מפתח",
  "cli.deleted": "נמחק: {ref}",
  "cli.usage.run": "שימוש: kv run <פרויקט> -- <פקודה>",
  "cli.usage.import": "שימוש: kv import <פרויקט> <קובץ.env>",
  "cli.usage.importPasswords": "שימוש: kv import-passwords <קובץ> [--delete]",
  "cli.usage.audit": "שימוש: kv audit [--breaches] [--json]",
  "cli.usage.unlock": "שימוש: kv unlock --remember",
  "cli.usage.lang": "שימוש: kv lang <en|he>",
  "cli.usage.completion": "שימוש: kv completion <bash|zsh|fish|powershell>",
  "cli.status.vault": "כספת",
  "cli.status.none": "עוד לא נוצרה — הרץ kv init",
  "cli.status.remembered": "זכורה במחשב הזה",
  "cli.status.yes": "כן",
  "cli.status.no": "לא",
  "cli.status.lang": "שפה",
  "cli.importedFrom": "יובא מ-{file}",
  "cli.imported": "יובאו {n} מפתחות ל-{project}: {names}",
  "cli.skippedEmpty": "דולגו (ריקים בקובץ): {names}",
  "cli.fileStillThere": "הקובץ המקורי עדיין על הדיסק — מחק אותו אם אין בו צורך.",
  "cli.importedItems": "{format}: נוספו {added} פריטים. כפילויות שדולגו: {duplicates}. דולגו (בלי סיסמה או ריקים): {skipped}.",
  "cli.importDeleted": "קובץ הייצוא נמחק.",
  "cli.importPlain": "קובץ הייצוא מכיל את הסיסמאות בטקסט גלוי — מחק אותו (או הרץ עם --delete).",
  "cli.prompt.exportPw": "סיסמה לקובץ הייצוא (לא סיסמת האב): ",
  "cli.prompt.fileSecret": "הסיסמה או קוד השחזור של {file}: ",
  "cli.exported": "יוצא (מוצפן): {path}\nהוא נפתח בסיסמה שבחרת עכשיו, לא בסיסמת האב. שחזור: kv restore <קובץ>",
  "cli.recoveryCode":
    "יוצא (מוצפן): {path}\n\nקוד שחזור — רשום או הדפס אותו. הוא מוצג רק הפעם:\n\n    {code}\n\nהקובץ הוא תמונת מצב של הכספת כרגע. שמור אותו רחוק מהמחשב הזה (דיסק און קי, ואת הקוד מודפס במגירה).\nשחזור: kv restore <קובץ>",
  "cli.restored": 'שוחזר אל {path} עם סיסמת האב החדשה. אם השתמשת ב"זכור אותי", הרץ kv unlock --remember.',
  "cli.usage.export": "שימוש: kv export <קובץ> [--recovery-code]",
  "cli.usage.restore": "שימוש: kv restore <קובץ> [--force]",
  "audit.title": "בריאות הסיסמאות — נבדקו {n} סיסמאות",
  "audit.reused": "חוזרות — אותה סיסמה בכמה פריטים ({n} קבוצות):",
  "audit.weak": "חלשות ({n}):",
  "audit.old": "לא הוחלפו יותר משנה ({n}):",
  "audit.no2fa": "התחברויות בלי מפתח אימות דו-שלבי: {n}",
  "audit.clean": "אין סיסמאות חוזרות, חלשות או ישנות.",
  "audit.breaches": "הופיעו בדליפות ידועות ({n}) — להחליף קודם:",
  "audit.breachesNone": "אף אחת מ-{n} הסיסמאות לא הופיעה בדליפות ידועות.",
  "audit.breachNote": "נשלחו ל-api.pwnedpasswords.com רק 5 התווים הראשונים של קוד ה-SHA-1 של כל סיסמה.",
  "audit.seen": "הופיעה {count} פעמים",
  "audit.more": "  … ועוד {n}",
  "cli.remembered": "נזכר למשתמש הזה במחשב הזה (DPAPI). לביטול: kv forget",
  "cli.forgotten": "הזכירה בוטלה — מעכשיו תידרש סיסמת אב",
  "cli.backedUp": "גובה (מוצפן): {path}",
  "cli.passwdChanged": "סיסמת האב הוחלפה. אם השתמשת בזכירה — הרץ שוב kv unlock --remember",
  "cli.unknownCommand": "פקודה לא מוכרת: {cmd}. הרץ kv help",
  "cli.langSet": "שפה: עברית",

  "ui.idle": "כבה אחרי 15 דקות בלי פעילות",
  "ui.locked": "ננעל מהחלון",
  "ui.closed": "נסגר",
  "ui.tooBig": "גדול מדי",
  "ui.open": "kv ui: פתוח ב-{url}\n      Ctrl+C לסגירה. נכבה לבד אחרי 15 דקות בלי פעילות.",
  "web.title": "כספת מפתחות",
  "web.search": "חיפוש פרויקט או מפתח",
  "web.searchLabel": "חיפוש",
  "web.add": "הוספת מפתח",
  "web.edit": "עריכת מפתח",
  "web.lock": "נעילה",
  "web.project": "פרויקט",
  "web.keyName": "שם המפתח",
  "web.value": "ערך",
  "web.note": "הערה (לא חובה)",
  "web.notePlaceholder": "למה זה משמש",
  "web.cancel": "ביטול",
  "web.save": "שמירה",
  "web.gone": "החלון נסגר או שהקישור לא תקף. הרץ שוב: kv ui",
  "web.noResults": "אין תוצאות",
  "web.empty": "הכספת ריקה — הוסף מפתח ראשון",
  "web.show": "הצג",
  "web.hide": "הסתר",
  "web.copy": "העתק",
  "web.copied": "הועתק — הלוח יתנקה בעוד 20 שניות",
  "web.editBtn": "עריכה",
  "web.delete": "מחיקה",
  "web.confirmDelete": "למחוק את {ref}?",
  "web.deleted": "נמחק",
  "web.newValue": "ערך חדש",
  "web.saved": "נשמר",
  "web.lockedNow": "הכספת ננעלה. אפשר לסגור את החלון.",
};

const M: Record<Lang, Record<MessageKey, string>> = { en: EN, he: HE };

function readConfig(): { lang?: string } {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  } catch {
    return {};
  }
}

const valid = (l: unknown): l is Lang => LANGS.includes(l as Lang);
let lang: Lang = [process.env.KV_LANG, readConfig().lang].find(valid) ?? "en";

export const getLang = (): Lang => lang;

// For this process only (the desktop backend follows the window's choice)
export function setLang(l: string): void {
  if (!valid(l)) throw new Error(t("lang.invalid", { lang: l }));
  lang = l;
}

// Persist as the default for the CLI
export function saveLang(l: string): void {
  setLang(l);
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ ...readConfig(), lang: l }, null, 1));
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return M[lang][key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

// The message table — for the browser UI page and for tests
export const messages = (l: Lang = lang): Record<MessageKey, string> => M[l];
