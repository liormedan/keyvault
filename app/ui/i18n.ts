// Window language: English by default, Hebrew on toggle. The choice is stored on this machine.
// Loaded in <head> (after theme.ts, both bundled into dist/head.js) so the page never flashes in the wrong language or direction.
// Static markup uses data-i18n / data-i18n-placeholder / data-i18n-aria; code uses tr(key, params).
import type { Label, Lang } from "../../src/model.ts";

const EN = {
  "app.title": "kv-vault",
  "setup.title": "New vault",
  "setup.lead": "Choose a master password.",
  "setup.warn": "It cannot be recovered if you forget it.",
  "setup.password": "Master password",
  "setup.again": "Again, to confirm",
  "setup.create": "Create vault",
  "unlock.password": "Master password",
  "unlock.remember": "Remember me on this computer",
  "unlock.open": "Unlock",
  "main.search": "Search",
  "main.add": "Add",
  "main.lock": "Lock",
  "main.categories": "Categories",
  "main.forget": "Stop remembering on this computer",
  "pick.title": "What do you want to add?",
  "pick.devKey": "Dev key",
  "pick.import": "Import passwords from a browser…",
  "dev.add": "Add dev key",
  "dev.edit": "Edit dev key",
  "dev.project": "Project",
  "dev.key": "Key name",
  "dev.value": "Value",
  "dev.note": "Note (optional)",
  "dev.notePlaceholder": "What it's for",
  "dev.newValue": "New value",
  "dev.envTag": "Has its own value in this environment (set with kv set --env)",
  cancel: "Cancel",
  save: "Save",
  delete: "Delete",
  edit: "Edit",
  close: "Close",
  show: "Show",
  hide: "Hide",
  copy: "Copy",
  copyField: "Copy {field}",
  copied: "Copied — the clipboard clears in 20 seconds",
  saved: "Saved",
  deleted: "Deleted",
  locked: "The vault locked",
  confirmDelete: "Delete {name}?",
  "cat.all": "All",
  "cat.fav": "Favorites",
  "cat.dev": "Dev keys",
  "empty.search": "No results",
  "empty.fav": "No favorites yet — star an item",
  "empty.all": 'Nothing here yet — click "Add"',
  "fav.add": "Add to favorites",
  "fav.remove": "Remove from favorites",
  "fav.label": "Favorite",
  "item.noFields": "No fields filled in",
  "item.addTitle": "Add — {type}",
  "item.editTitle": "Edit — {type}",
  "item.title": "Title",
  generate: "Generate password",
  "import.title": "Import passwords from a browser",
  "import.lead": 'Export a CSV file from your browser, then choose it here. Each row becomes a "Login" item.',
  "import.export": "Export passwords",
  "import.also": "Also works with export files from Safari, 1Password, Bitwarden and LastPass.",
  "import.choose": "Choose CSV file",
  "import.added": "Added {n} logins",
  "import.duplicates": "{n} duplicates skipped",
  "import.skipped": "{n} rows without a password skipped",
  "import.done": "Import finished",
  "import.plainBefore": "The file ",
  "import.plainAfter": " holds every password in plain text. Delete it now.",
  "import.keep": "Keep the file",
  "import.deleteFile": "Delete the file",
  "import.fileDeleted": "The CSV file was deleted",
  "pw.mismatch": "Passwords don't match",
  forgotten: "Remember me removed — the master password will be required next time",
  "theme.light": "Light mode",
  "theme.dark": "Dark mode",
  "lang.other": "עברית",
};

export type UiKey = keyof typeof EN;

// Hebrew must cover every English key — a missing one fails to compile
const HE: Record<UiKey, string> = {
  "app.title": "כספת מפתחות",
  "setup.title": "כספת חדשה",
  "setup.lead": "בחר סיסמת אב.",
  "setup.warn": "אין דרך לשחזר אותה אם שוכחים.",
  "setup.password": "סיסמת אב",
  "setup.again": "שוב, לאימות",
  "setup.create": "יצירת כספת",
  "unlock.password": "סיסמת אב",
  "unlock.remember": "זכור אותי במחשב הזה",
  "unlock.open": "פתיחה",
  "main.search": "חיפוש",
  "main.add": "הוספה",
  "main.lock": "נעילה",
  "main.categories": "קטגוריות",
  "main.forget": "ביטול הזכירה במחשב הזה",
  "pick.title": "מה להוסיף?",
  "pick.devKey": "מפתח פיתוח",
  "pick.import": "ייבוא סיסמאות מדפדפן…",
  "dev.add": "הוספת מפתח פיתוח",
  "dev.edit": "עריכת מפתח פיתוח",
  "dev.project": "פרויקט",
  "dev.key": "שם המפתח",
  "dev.value": "ערך",
  "dev.note": "הערה (לא חובה)",
  "dev.notePlaceholder": "למה זה משמש",
  "dev.newValue": "ערך חדש",
  "dev.envTag": "יש לו ערך משלו בסביבה הזו (נקבע ב-kv set --env)",
  cancel: "ביטול",
  save: "שמירה",
  delete: "מחיקה",
  edit: "עריכה",
  close: "סגירה",
  show: "הצג",
  hide: "הסתר",
  copy: "העתק",
  copyField: "העתק {field}",
  copied: "הועתק — הלוח יתנקה בעוד 20 שניות",
  saved: "נשמר",
  deleted: "נמחק",
  locked: "הכספת ננעלה",
  confirmDelete: "למחוק את {name}?",
  "cat.all": "הכול",
  "cat.fav": "מועדפים",
  "cat.dev": "מפתחות פיתוח",
  "empty.search": "אין תוצאות",
  "empty.fav": "אין מועדפים — סמן כוכב ליד פריט",
  "empty.all": 'אין כאן עדיין כלום — לחץ "הוספה"',
  "fav.add": "הוסף למועדפים",
  "fav.remove": "הסר ממועדפים",
  "fav.label": "מועדף",
  "item.noFields": "אין שדות מלאים",
  "item.addTitle": "הוספה — {type}",
  "item.editTitle": "עריכה — {type}",
  "item.title": "כותרת",
  generate: "צור סיסמה",
  "import.title": "ייבוא סיסמאות מדפדפן",
  "import.lead": 'מייצאים בדפדפן קובץ CSV, ובוחרים אותו כאן. כל שורה הופכת לפריט "התחברות לאתר".',
  "import.export": "ייצוא סיסמאות",
  "import.also": "מתאים גם לקובצי ייצוא של Safari, 1Password, Bitwarden ו-LastPass.",
  "import.choose": "בחירת קובץ CSV",
  "import.added": "נוספו {n} התחברויות",
  "import.duplicates": "{n} כפילויות דולגו",
  "import.skipped": "{n} שורות בלי סיסמה דולגו",
  "import.done": "הייבוא הסתיים",
  "import.plainBefore": "הקובץ ",
  "import.plainAfter": " מכיל את כל הסיסמאות בטקסט גלוי. מומלץ למחוק אותו עכשיו.",
  "import.keep": "להשאיר את הקובץ",
  "import.deleteFile": "מחיקת הקובץ",
  "import.fileDeleted": "קובץ ה-CSV נמחק",
  "pw.mismatch": "הסיסמאות לא תואמות",
  forgotten: "הזכירה בוטלה — בפעם הבאה תידרש סיסמת אב",
  "theme.light": "מצב בהיר",
  "theme.dark": "מצב כהה",
  "lang.other": "English",
};

const M: Record<Lang, Record<UiKey, string>> = { en: EN, he: HE };
const KEY = "kv-lang";

(() => {
  const read = (): Lang => {
    try {
      return localStorage.getItem(KEY) === "he" ? "he" : "en";
    } catch {
      return "en";
    }
  };
  let lang: Lang = read();
  const root = document.documentElement;

  const tr = (key: UiKey, params: Record<string, string | number> = {}): string =>
    M[lang][key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
  // { en, he } labels from src/types.js
  const L = (v: Label | string | undefined): string => (v && typeof v === "object" ? (v[lang] ?? v.en) : (v ?? ""));

  function applyStatic(): void {
    root.lang = lang;
    root.dir = lang === "he" ? "rtl" : "ltr";
    document.title = tr("app.title");
    for (const e of document.querySelectorAll<HTMLElement>("[data-i18n]")) e.textContent = tr(e.dataset.i18n as UiKey);
    for (const e of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) e.placeholder = tr(e.dataset.i18nPlaceholder as UiKey);
    for (const e of document.querySelectorAll<HTMLElement>("[data-i18n-aria]")) e.setAttribute("aria-label", tr(e.dataset.i18nAria as UiKey));
    for (const b of document.querySelectorAll(".lang-toggle")) b.textContent = tr("lang.other");
    window.__TAURI__?.window
      .getCurrentWindow()
      .setTitle(tr("app.title"))
      .catch(() => {});
  }

  function set(l: Lang): void {
    lang = l === "he" ? "he" : "en";
    try {
      localStorage.setItem(KEY, lang);
    } catch {}
    applyStatic();
    document.dispatchEvent(new CustomEvent("kv-lang", { detail: lang }));
  }

  root.lang = lang;
  root.dir = lang === "he" ? "rtl" : "ltr";
  document.addEventListener("DOMContentLoaded", () => {
    applyStatic();
    for (const b of document.querySelectorAll(".lang-toggle")) b.addEventListener("click", () => set(lang === "he" ? "en" : "he"));
  });

  window.I18N = { tr, L, set, lang: () => lang };
})();
