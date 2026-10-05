// Import logins from a password CSV exported by a browser (Chrome, Edge, Firefox, Safari)
// or a password manager (Bitwarden, LastPass, 1Password). Columns are matched by name, not position.
// The export is plaintext — values are parsed in memory and never logged or echoed.
import fs from "node:fs";

const MAX_BYTES = 20 * 1024 * 1024;

// RFC 4180: quoted fields, "" as an escaped quote, commas and newlines inside quotes
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

const ALIASES = {
  title: ["name", "title"],
  url: ["url", "login_uri", "website", "web site", "origin"],
  username: ["username", "login_username", "login name", "user"],
  password: ["password", "login_password"],
  notes: ["note", "notes", "extra", "comments"],
  totp: ["totp", "otpauth", "login_totp"],
};

const hostOf = (url) => {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).host;
  } catch {
    return url;
  }
};

// → { logins: [{ title, fields }], skipped } — rows without a password are skipped
export function csvToLogins(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("הקובץ ריק או שאינו קובץ CSV של סיסמאות");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [field, names] of Object.entries(ALIASES)) col[field] = header.findIndex((h) => names.includes(h));
  if (col.password < 0 || (col.url < 0 && col.title < 0)) {
    throw new Error("לא נמצאו העמודות הצפויות (password, ו-url או name). זה קובץ ייצוא סיסמאות מדפדפן?");
  }
  const logins = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (f) => (col[f] >= 0 ? (r[col[f]] ?? "") : "");
    const password = get("password");
    if (!password) { skipped++; continue; }
    const url = get("url").trim();
    logins.push({
      title: get("title").trim() || hostOf(url) || "(ללא שם)",
      fields: { url, username: get("username").trim(), password, totp: get("totp").trim(), notes: get("notes") },
    });
  }
  return { logins, skipped };
}

export function readLoginsFile(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    throw new Error("הקובץ לא נמצא");
  }
  if (!st.isFile()) throw new Error("זה לא קובץ");
  if (st.size > MAX_BYTES) throw new Error("הקובץ גדול מדי (מעל 20MB)");
  return csvToLogins(fs.readFileSync(file, "utf8"));
}
