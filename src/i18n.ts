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
    "vault.none": "No vault at {path}. Run: kv init",
    "vault.exists": "A vault already exists at {path}",
    "kdf.unknown": "Unknown algorithm: {alg}",
    "ref.invalid": "Invalid name: \"{ref}\". Use project/KEY, e.g. my-app/API_KEY",
    "entry.notFound": "Not found: {ref}",
    "entry.missing": "Missing project, name or value (no / in the project name)",
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
    "op.unknown": "Unknown action: {name}",
    "tty.none": "No terminal to type a password. Run first: kv unlock --remember",
    "cancelled": "Cancelled",
    "lang.invalid": "Unknown language: {lang}. Use: en, he",

    "cli.help": `kv — kv-vault, a local vault for development keys

  kv init                          create a new vault (master password)
  kv set  <project/KEY> [--note "..."]   add or update. The value is typed hidden, or piped in
  kv get  <project/KEY>            write the value to stdout — pipes only (kv get x | vercel env add ...)
  kv copy <project/KEY>            copy to the clipboard, cleared after 20 seconds
  kv ls   [project]                list names, never values
  kv rm   <project/KEY>            delete
  kv run  <project> -- <command>   run a command with the project's keys as environment variables
  kv import <project> <file.env>   import an env file
  kv import-passwords <file.csv> [--delete]   import logins from a browser export (Chrome / Edge / Firefox)
  kv ui                            browser window to view, search and edit (local only)
  kv unlock --remember             remember the vault for this Windows user (no password each time)
  kv forget                        drop the remembered key
  kv backup [dir]                  dated encrypted copy (default: KV_BACKUP_DIR, or backups next to the vault)
  kv passwd                        change the master password
  kv lang <en|he>                  interface language

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
    "cli.usage.importPasswords": "Usage: kv import-passwords <file.csv> [--delete]",
    "cli.usage.unlock": "Usage: kv unlock --remember",
    "cli.usage.lang": "Usage: kv lang <en|he>",
    "cli.importedFrom": "imported from {file}",
    "cli.imported": "Imported {n} keys into {project}: {names}",
    "cli.skippedEmpty": "Skipped (empty in the file): {names}",
    "cli.fileStillThere": "The original file is still on disk — delete it if you don't need it.",
    "cli.importedLogins": "Added {added} logins. Duplicates skipped: {duplicates}. Rows without a password: {skipped}.",
    "cli.csvDeleted": "The CSV file was deleted.",
    "cli.csvPlain": "The CSV file holds the passwords in plain text — delete it (or run with --delete).",
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
    "vault.none": "אין כספת ב-{path}. הרץ: kv init",
    "vault.exists": "כבר קיימת כספת ב-{path}",
    "kdf.unknown": "אלגוריתם לא מוכר: {alg}",
    "ref.invalid": "שם לא תקין: \"{ref}\". הצורה: פרויקט/מפתח, למשל my-app/API_KEY",
    "entry.notFound": "לא נמצא: {ref}",
    "entry.missing": "חסר פרויקט, שם או ערך (בלי / בשם הפרויקט)",
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
    "op.unknown": "פעולה לא מוכרת: {name}",
    "tty.none": "אין טרמינל להקלדת סיסמה. הרץ קודם: kv unlock --remember",
    "cancelled": "בוטל",
    "lang.invalid": "שפה לא מוכרת: {lang}. אפשר: en, he",

    "cli.help": `kv — כספת מקומית למפתחות

  kv init                        יצירת כספת חדשה (סיסמת אב)
  kv set  <פרויקט/מפתח> [--note "..."]   הוספה/עדכון. הערך מוקלד מוסתר, או מגיע מצינור
  kv get  <פרויקט/מפתח>          כתיבת הערך ל-stdout — רק לצינור (kv get x | vercel env add ...)
  kv copy <פרויקט/מפתח>          העתקה ללוח, נמחק אחרי 20 שניות
  kv ls   [פרויקט]               רשימת שמות, בלי ערכים
  kv rm   <פרויקט/מפתח>          מחיקה
  kv run  <פרויקט> -- <פקודה>     הרצת פקודה עם מפתחות הפרויקט כמשתני סביבה
  kv import <פרויקט> <קובץ.env>  ייבוא מקובץ env
  kv import-passwords <קובץ.csv> [--delete]   ייבוא סיסמאות מקובץ ייצוא של דפדפן (Chrome / Edge / Firefox)
  kv ui                          חלון לצפייה, חיפוש ועריכה (נפתח בדפדפן, מקומי בלבד)
  kv unlock --remember           זכירת הכספת למשתמש הזה ב-Windows (בלי להקליד סיסמה כל פעם)
  kv forget                      ביטול הזכירה
  kv backup [תיקייה]             עותק מוצפן עם תאריך (ברירת מחדל: KV_BACKUP_DIR, או backups ליד הכספת)
  kv passwd                      החלפת סיסמת אב
  kv lang <en|he>                שפת הממשק

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
    "cli.usage.importPasswords": "שימוש: kv import-passwords <קובץ.csv> [--delete]",
    "cli.usage.unlock": "שימוש: kv unlock --remember",
    "cli.usage.lang": "שימוש: kv lang <en|he>",
    "cli.importedFrom": "יובא מ-{file}",
    "cli.imported": "יובאו {n} מפתחות ל-{project}: {names}",
    "cli.skippedEmpty": "דולגו (ריקים בקובץ): {names}",
    "cli.fileStillThere": "הקובץ המקורי עדיין על הדיסק — מחק אותו אם אין בו צורך.",
    "cli.importedLogins": "נוספו {added} התחברויות. כפילויות שדולגו: {duplicates}. שורות בלי סיסמה: {skipped}.",
    "cli.csvDeleted": "קובץ ה-CSV נמחק.",
    "cli.csvPlain": "קובץ ה-CSV מכיל את הסיסמאות בטקסט גלוי — מחק אותו (או הרץ עם --delete).",
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
