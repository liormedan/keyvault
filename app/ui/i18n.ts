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
  "main.export": "Emergency export…",
  "cat.health": "Password health",
  "health.loading": "Checking…",
  "health.summary": "{n} passwords checked",
  "health.reusedCount": "{n} reused groups",
  "health.weakCount": "{n} weak",
  "health.oldCount": "{n} older than a year",
  "health.reused": "Reused passwords",
  "health.reusedLead": "The same password on several items: if one site leaks, the others are open too. Give each its own (Edit → Generate password).",
  "health.group": "{n} items share one password",
  "health.weak": "Weak passwords",
  "health.old": "Not changed for over a year",
  "health.no2fa": "Logins without two-factor",
  "health.no2faLead": "Where a site offers two-factor sign-in, turn it on there and paste its key into the item's two-factor field.",
  "health.clean": "No reused, weak or old passwords.",
  "health.more": "… and {n} more",
  "weak.common": "very common",
  "weak.repeated": "one repeated character",
  "weak.short": "under 8 characters",
  "weak.digits": "digits only",
  "weak.letters": "letters only",
  "breach.title": "Known breaches",
  "breach.lead":
    "Checks each password against Have I Been Pwned. Only the first 5 characters of its SHA-1 hash leave this computer; the match happens here. Nothing is sent until you click.",
  "breach.check": "Check now",
  "breach.again": "Check again",
  "breach.none": "None of the {n} passwords appear in known breaches.",
  "breach.found": "{n} passwords appear in known breaches. Change these first.",
  "breach.seen": "Seen {count} times in breaches",
  "totp.label": "Two-factor code",
  "totp.seconds": "{s} s",
  "totp.copy": "Copy code",
  "totp.paused": "Paused — reopen the item",
  "export.title": "Emergency export",
  "export.lead":
    "An encrypted copy of the whole vault, in a file of its own. If you forget the master password, this file and its code are the way back. Keep the file away from this computer (a USB stick, cloud storage).",
  "export.withCode": "Lock it with a recovery code (recommended — print it)",
  "export.withPassword": "Lock it with a password I choose",
  "export.password": "Password for the file (not the master password)",
  "export.again": "Again, to confirm",
  "export.noPassword": "Choose a password for the file",
  "export.snapshot": "It's a snapshot: what you add later isn't in it. Make a new one now and then.",
  "export.save": "Choose where to save",
  "export.done": "Export saved",
  "export.savedTo": "Saved to",
  "export.codeLead": "Recovery code — write it down or print it. It is shown only now, and the file can't be opened without it:",
  "export.passwordDone": "The file opens with the password you chose.",
  "export.restore": "To restore on any computer:",
  "import.filter": "Password exports",
  "pick.title": "What do you want to add?",
  "pick.devKey": "Dev key",
  "pick.import": "Import from a browser or password manager…",
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
  "import.title": "Import passwords",
  "import.lead": "Export your passwords to a file, then choose it here. From a browser:",
  "import.export": "Export passwords",
  "import.also": "From a password manager: 1Password (.1pux or CSV), Bitwarden (.json, not encrypted), KeePass (.xml), LastPass and Safari (CSV).",
  "import.choose": "Choose file",
  "import.added": "added {n} items",
  "import.duplicates": "{n} duplicates skipped",
  "import.skipped": "{n} skipped (no password, or empty)",
  "import.done": "Import finished",
  "import.plainBefore": "The file ",
  "import.plainAfter": " holds every password in plain text. Delete it now.",
  "import.keep": "Keep the file",
  "import.deleteFile": "Delete the file",
  "import.fileDeleted": "The export file was deleted",
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
  "main.export": "ייצוא חירום…",
  "cat.health": "בריאות סיסמאות",
  "health.loading": "בודק…",
  "health.summary": "נבדקו {n} סיסמאות",
  "health.reusedCount": "{n} קבוצות חוזרות",
  "health.weakCount": "{n} חלשות",
  "health.oldCount": "{n} ישנות משנה",
  "health.reused": "סיסמאות חוזרות",
  "health.reusedLead": "אותה סיסמה בכמה פריטים: אם אתר אחד דולף, גם האחרים פתוחים. לכל אחד סיסמה משלו (עריכה ← צור סיסמה).",
  "health.group": "{n} פריטים עם אותה סיסמה",
  "health.weak": "סיסמאות חלשות",
  "health.old": "לא הוחלפו יותר משנה",
  "health.no2fa": "התחברויות בלי אימות דו-שלבי",
  "health.no2faLead": "איפה שהאתר מציע כניסה באימות דו-שלבי, הפעל אותו שם והדבק את המפתח בשדה האימות הדו-שלבי של הפריט.",
  "health.clean": "אין סיסמאות חוזרות, חלשות או ישנות.",
  "health.more": "… ועוד {n}",
  "weak.common": "נפוצה מאוד",
  "weak.repeated": "תו אחד שחוזר",
  "weak.short": "פחות מ-8 תווים",
  "weak.digits": "ספרות בלבד",
  "weak.letters": "אותיות בלבד",
  "breach.title": "דליפות ידועות",
  "breach.lead": "בודק כל סיסמה מול Have I Been Pwned. רק 5 התווים הראשונים של קוד ה-SHA-1 שלה יוצאים מהמחשב, וההשוואה נעשית כאן. שום דבר לא נשלח עד שלוחצים.",
  "breach.check": "בדוק עכשיו",
  "breach.again": "בדוק שוב",
  "breach.none": "אף אחת מ-{n} הסיסמאות לא הופיעה בדליפות ידועות.",
  "breach.found": "{n} סיסמאות הופיעו בדליפות ידועות. להחליף אותן קודם.",
  "breach.seen": "הופיעה {count} פעמים בדליפות",
  "totp.label": "קוד אימות דו-שלבי",
  "totp.seconds": "{s} שנ׳",
  "totp.copy": "העתק קוד",
  "totp.paused": "מושהה — פתח את הפריט שוב",
  "export.title": "ייצוא חירום",
  "export.lead":
    "עותק מוצפן של כל הכספת, בקובץ נפרד. אם שוכחים את סיסמת האב, הקובץ הזה והקוד שלו הם הדרך חזרה. שמור את הקובץ רחוק מהמחשב הזה (דיסק און קי, אחסון בענן).",
  "export.withCode": "נעילה בקוד שחזור (מומלץ — להדפיס אותו)",
  "export.withPassword": "נעילה בסיסמה שאבחר",
  "export.password": "סיסמה לקובץ (לא סיסמת האב)",
  "export.again": "שוב, לאימות",
  "export.noPassword": "בחר סיסמה לקובץ",
  "export.snapshot": "זו תמונת מצב: מה שתוסיף אחר כך לא יהיה בה. כדאי לייצא מחדש מדי פעם.",
  "export.save": "בחירת מקום לשמירה",
  "export.done": "הייצוא נשמר",
  "export.savedTo": "נשמר ב-",
  "export.codeLead": "קוד שחזור — רשום או הדפס אותו. הוא מוצג רק עכשיו, ובלעדיו אי אפשר לפתוח את הקובץ:",
  "export.passwordDone": "הקובץ נפתח בסיסמה שבחרת.",
  "export.restore": "לשחזור בכל מחשב:",
  "import.filter": "קובצי ייצוא סיסמאות",
  "pick.title": "מה להוסיף?",
  "pick.devKey": "מפתח פיתוח",
  "pick.import": "ייבוא מדפדפן או ממנהל סיסמאות…",
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
  "import.title": "ייבוא סיסמאות",
  "import.lead": "מייצאים את הסיסמאות לקובץ, ובוחרים אותו כאן. מדפדפן:",
  "import.export": "ייצוא סיסמאות",
  "import.also": "ממנהל סיסמאות: 1Password (‏.1pux או CSV), Bitwarden (‏.json, לא מוצפן), KeePass (‏.xml), LastPass ו-Safari (CSV).",
  "import.choose": "בחירת קובץ",
  "import.added": "נוספו {n} פריטים",
  "import.duplicates": "{n} כפילויות דולגו",
  "import.skipped": "{n} דולגו (בלי סיסמה, או ריקים)",
  "import.done": "הייבוא הסתיים",
  "import.plainBefore": "הקובץ ",
  "import.plainAfter": " מכיל את כל הסיסמאות בטקסט גלוי. מומלץ למחוק אותו עכשיו.",
  "import.keep": "להשאיר את הקובץ",
  "import.deleteFile": "מחיקת הקובץ",
  "import.fileDeleted": "קובץ הייצוא נמחק",
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
