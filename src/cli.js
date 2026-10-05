#!/usr/bin/env node
// kv — a local, encrypted vault for development keys.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as dpapi from "./dpapi.js";
import { readLoginsFile } from "./import-csv.js";
import { copyWithClear, readHidden, readStdin } from "./io.js";
import * as store from "./store.js";

const HELP = `kv — כספת מקומית למפתחות

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

הכספת: ${store.VAULT}`;

const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const err = (msg) => process.stderr.write(`${msg}\n`);

async function unlock() {
  const cached = dpapi.recall(store.salt());
  if (cached) {
    try {
      return await store.unlockWithKey(cached);
    } catch {
      dpapi.forget();
    }
  }
  return store.unlockWithPassword(await readHidden("סיסמת אב: "));
}

async function newPassword() {
  const a = await readHidden("סיסמת אב חדשה: ");
  if (!a) throw new Error("סיסמת אב ריקה");
  const b = await readHidden("שוב, לאימות: ");
  if (a !== b) throw new Error("הסיסמאות לא תואמות");
  return a;
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const commands = {
  async init() {
    const pw = await newPassword();
    await store.create(pw);
    err(`נוצרה כספת: ${store.VAULT}`);
    err("אין דרך לשחזר סיסמת אב שנשכחה — כדאי לרשום אותה במקום בטוח.");
  },

  async set() {
    const [p, k] = store.parseRef(args.shift());
    const note = flag("--note");
    const { key, data } = await unlock();
    const value = process.stdin.isTTY ? await readHidden(`ערך ל-${p}/${k}: `) : await readStdin();
    if (!value) throw new Error("ערך ריק — לא נשמר");
    store.setEntry(data, p, k, value, note);
    await store.save(key, data);
    err(`נשמר: ${p}/${k}`);
  },

  async get() {
    const [p, k] = store.parseRef(args.shift());
    if (process.stdout.isTTY && !has("--show")) {
      throw new Error("לא מציג ערכים על המסך. השתמש ב-kv copy, או בצינור: kv get x | ...  (או --show)");
    }
    const { data } = await unlock();
    process.stdout.write(store.getEntry(data, p, k).value);
  },

  async copy() {
    const [p, k] = store.parseRef(args.shift());
    const { data } = await unlock();
    copyWithClear(store.getEntry(data, p, k).value, 20);
    err(`הועתק ${p}/${k} — הלוח יתנקה בעוד 20 שניות`);
  },

  async ls() {
    const only = args.shift();
    const { data } = await unlock();
    const list = store.listing(data);
    const names = Object.keys(list).filter((p) => !only || p === only).sort();
    if (!names.length) return err(only ? `אין פרויקט ${only}` : "הכספת ריקה. הוסף: kv set פרויקט/מפתח");
    for (const p of names) {
      console.log(p);
      for (const e of list[p]) console.log(`  ${e.key}${e.note ? `  — ${e.note}` : ""}`);
    }
  },

  async rm() {
    const [p, k] = store.parseRef(args.shift());
    const { key, data } = await unlock();
    store.deleteEntry(data, p, k);
    await store.save(key, data);
    err(`נמחק: ${p}/${k}`);
  },

  async run() {
    const p = args.shift();
    const sep = args.indexOf("--");
    const command = sep >= 0 ? args.slice(sep + 1) : args;
    if (!p || !command.length) throw new Error("שימוש: kv run <פרויקט> -- <פקודה>");
    const { data } = await unlock();
    const keys = data.projects[p];
    if (!keys) throw new Error(`אין פרויקט ${p}`);
    const env = { ...process.env };
    for (const [k, e] of Object.entries(keys)) env[k] = e.value;
    // On Windows a shell is needed to run pnpm.cmd / vercel.cmd, so pass one string, quoting arguments that contain spaces
    const win = process.platform === "win32";
    const q = (a) => (/[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
    const child = win
      ? spawn(command.map(q).join(" "), { stdio: "inherit", env, shell: true })
      : spawn(command[0], command.slice(1), { stdio: "inherit", env });
    child.on("exit", (code) => process.exit(code ?? 1));
  },

  async import() {
    const p = args.shift();
    const file = args.shift();
    if (!p || !file) throw new Error("שימוש: kv import <פרויקט> <קובץ.env>");
    const all = Object.entries(parseEnv(fs.readFileSync(file, "utf8")));
    const pairs = all.filter(([, v]) => v !== "");
    const empty = all.filter(([, v]) => v === "").map(([k]) => k);
    const { key, data } = await unlock();
    for (const [k, v] of pairs) store.setEntry(data, p, k, v, `יובא מ-${path.basename(file)}`);
    await store.save(key, data);
    err(`יובאו ${pairs.length} מפתחות ל-${p}: ${pairs.map(([k]) => k).join(", ")}`);
    if (empty.length) err(`דולגו (ריקים בקובץ): ${empty.join(", ")}`);
    err("הקובץ המקורי עדיין על הדיסק — מחק אותו אם אין בו צורך.");
  },

  async "import-passwords"() {
    const del = has("--delete");
    const file = args.shift();
    if (!file) throw new Error("שימוש: kv import-passwords <קובץ.csv> [--delete]");
    const { logins, skipped } = readLoginsFile(file);
    const { key, data } = await unlock();
    const { added, duplicates } = store.importLogins(data, logins);
    if (added) await store.save(key, data);
    err(`נוספו ${added} התחברויות. כפילויות שדולגו: ${duplicates}. שורות בלי סיסמה: ${skipped}.`);
    if (del) {
      fs.rmSync(file, { force: true });
      err("קובץ ה-CSV נמחק.");
    } else {
      err("קובץ ה-CSV מכיל את הסיסמאות בטקסט גלוי — מחק אותו (או הרץ עם --delete).");
    }
  },

  async unlock() {
    if (!has("--remember")) throw new Error("שימוש: kv unlock --remember");
    const { key } = await store.unlockWithPassword(await readHidden("סיסמת אב: "));
    dpapi.remember(key, store.salt());
    err("נזכר למשתמש הזה במחשב הזה (DPAPI). לביטול: kv forget");
  },

  async forget() {
    dpapi.forget();
    err("הזכירה בוטלה — מעכשיו תידרש סיסמת אב");
  },

  async backup() {
    store.readFile();
    const dir = args.shift() || process.env.KV_BACKUP_DIR || path.join(store.HOME, "backups");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = path.join(dir, `vault_${stamp}.kv`);
    fs.copyFileSync(store.VAULT, dest);
    err(`גובה (מוצפן): ${dest}`);
  },

  async passwd() {
    const { data } = await store.unlockWithPassword(await readHidden("סיסמת אב נוכחית: "));
    const pw = await newPassword();
    const bak = `${store.VAULT}.before-passwd`;
    fs.copyFileSync(store.VAULT, bak);
    fs.rmSync(store.VAULT);
    try {
      const { key } = await store.create(pw);
      await store.save(key, data);
      fs.rmSync(bak);
    } catch (e) {
      fs.copyFileSync(bak, store.VAULT);
      throw e;
    }
    dpapi.forget();
    err("סיסמת האב הוחלפה. אם השתמשת בזכירה — הרץ שוב kv unlock --remember");
  },

  async ui() {
    const { startUi } = await import("./ui-server.js");
    await startUi(await unlock());
  },
};

try {
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
  } else if (!commands[cmd]) {
    throw new Error(`פקודה לא מוכרת: ${cmd}. הרץ kv help`);
  } else {
    await commands[cmd]();
  }
} catch (e) {
  err(`kv: ${e.message}`);
  process.exit(1);
}
