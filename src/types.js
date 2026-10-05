// Item types. Single source of truth — the backend validates against it and the window builds its forms from it.
// label / plural: { en, he }. secret: never sent in listings, hidden until revealed. generate: adds a "generate password" button. primary: what quick-copy copies.

import { getLang } from "./i18n.js";

const notes = { k: "notes", label: { en: "Notes", he: "הערות" }, kind: "multiline" };

export const TYPES = {
  login: {
    label: { en: "Login", he: "התחברות לאתר" },
    plural: { en: "Logins", he: "אתרים" },
    primary: "password",
    fields: [
      { k: "url", label: { en: "Website", he: "כתובת האתר" }, kind: "url", ltr: true },
      { k: "username", label: { en: "Username / email", he: "שם משתמש / מייל" }, ltr: true },
      { k: "password", label: { en: "Password", he: "סיסמה" }, secret: true, generate: true, ltr: true },
      { k: "totp", label: { en: "Two-factor key (2FA)", he: "מפתח אימות דו-שלבי (2FA)" }, secret: true, ltr: true },
      notes,
    ],
  },
  card: {
    label: { en: "Credit card", he: "כרטיס אשראי" },
    plural: { en: "Cards", he: "כרטיסים" },
    primary: "number",
    fields: [
      { k: "cardholder", label: { en: "Cardholder", he: "שם בעל הכרטיס" } },
      { k: "number", label: { en: "Card number", he: "מספר כרטיס" }, secret: true, kind: "card", ltr: true },
      { k: "expiry", label: { en: "Expiry (MM/YY)", he: "תוקף (MM/YY)" }, ltr: true, placeholder: "08/29" },
      { k: "cvv", label: { en: "CVV", he: "CVV" }, secret: true, ltr: true },
      { k: "pin", label: { en: "PIN", he: "קוד סודי" }, secret: true, ltr: true },
      { k: "issuer", label: { en: "Issuer / bank", he: "חברת האשראי / הבנק" } },
      notes,
    ],
  },
  bank: {
    label: { en: "Bank account", he: "חשבון בנק" },
    plural: { en: "Banks", he: "בנקים" },
    primary: "account",
    fields: [
      { k: "bank", label: { en: "Bank", he: "בנק" } },
      { k: "branch", label: { en: "Branch", he: "סניף" }, ltr: true },
      { k: "account", label: { en: "Account number", he: "מספר חשבון" }, secret: true, ltr: true },
      { k: "iban", label: { en: "IBAN", he: "IBAN" }, secret: true, ltr: true },
      { k: "username", label: { en: "Online banking username", he: "שם משתמש לאתר הבנק" }, ltr: true },
      { k: "password", label: { en: "Online banking password", he: "סיסמה לאתר הבנק" }, secret: true, generate: true, ltr: true },
      notes,
    ],
  },
  identity: {
    label: { en: "Identity document", he: "מסמך מזהה" },
    plural: { en: "Documents", he: "מסמכים" },
    primary: "idNumber",
    fields: [
      { k: "fullName", label: { en: "Full name", he: "שם מלא" } },
      { k: "idNumber", label: { en: "ID number", he: "תעודת זהות" }, secret: true, ltr: true },
      { k: "passport", label: { en: "Passport number", he: "מספר דרכון" }, secret: true, ltr: true },
      { k: "passportExpiry", label: { en: "Passport expiry", he: "תוקף דרכון" }, ltr: true },
      { k: "license", label: { en: "Driver's license", he: "רישיון נהיגה" }, secret: true, ltr: true },
      { k: "birthDate", label: { en: "Date of birth", he: "תאריך לידה" }, ltr: true },
      { k: "phone", label: { en: "Phone", he: "טלפון" }, ltr: true },
      { k: "email", label: { en: "Email", he: "מייל" }, ltr: true },
      { k: "address", label: { en: "Address", he: "כתובת" } },
      notes,
    ],
  },
  wifi: {
    label: { en: "Wi-Fi network", he: "רשת Wi-Fi" },
    plural: { en: "Wi-Fi", he: "רשתות" },
    primary: "password",
    fields: [
      { k: "ssid", label: { en: "Network name (SSID)", he: "שם הרשת" }, ltr: true },
      { k: "password", label: { en: "Password", he: "סיסמה" }, secret: true, generate: true, ltr: true },
      { k: "security", label: { en: "Security", he: "אבטחה" }, ltr: true, placeholder: "WPA2 / WPA3" },
      notes,
    ],
  },
  server: {
    label: { en: "Server / SSH", he: "שרת / SSH" },
    plural: { en: "Servers", he: "שרתים" },
    primary: "password",
    fields: [
      { k: "host", label: { en: "Address", he: "כתובת" }, ltr: true },
      { k: "port", label: { en: "Port", he: "פורט" }, ltr: true, placeholder: "22" },
      { k: "username", label: { en: "User", he: "משתמש" }, ltr: true },
      { k: "password", label: { en: "Password", he: "סיסמה" }, secret: true, generate: true, ltr: true },
      { k: "privateKey", label: { en: "Private key", he: "מפתח פרטי" }, secret: true, kind: "multiline", ltr: true },
      notes,
    ],
  },
  license: {
    label: { en: "Software license", he: "רישיון תוכנה" },
    plural: { en: "Licenses", he: "רישיונות" },
    primary: "key",
    fields: [
      { k: "product", label: { en: "Product", he: "מוצר" } },
      { k: "key", label: { en: "License key", he: "מפתח רישיון" }, secret: true, ltr: true },
      { k: "email", label: { en: "Registered email", he: "רשום למייל" }, ltr: true },
      { k: "version", label: { en: "Version", he: "גרסה" }, ltr: true },
      notes,
    ],
  },
  note: {
    label: { en: "Secure note", he: "פתק מאובטח" },
    plural: { en: "Notes", he: "פתקים" },
    primary: "body",
    fields: [{ k: "body", label: { en: "Content", he: "תוכן" }, secret: true, kind: "multiline" }],
  },
};

const host = (url) => {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).host;
  } catch {
    return url;
  }
};

// Subtitle in the list — non-secret fields only (plus a card's last 4 digits)
export function subtitle(item) {
  const f = item.fields || {};
  switch (item.type) {
    case "login": return [f.username, f.url && host(f.url)].filter(Boolean).join(" · ");
    case "card": {
      const digits = String(f.number || "").replace(/\D/g, "");
      return [f.issuer, digits.length >= 4 && `•••• ${digits.slice(-4)}`, f.expiry].filter(Boolean).join(" · ");
    }
    case "bank": return [f.bank, f.branch && `${fieldDef("bank", "branch").label[getLang()]} ${f.branch}`].filter(Boolean).join(" · ");
    case "identity": return f.fullName || "";
    case "wifi": return f.ssid || "";
    case "server": return f.host ? `${f.username ? `${f.username}@` : ""}${f.host}${f.port ? `:${f.port}` : ""}` : "";
    case "license": return [f.product, f.version].filter(Boolean).join(" ");
    default: return "";
  }
}

export function fieldDef(type, k) {
  return TYPES[type]?.fields.find((f) => f.k === k);
}
