// Item types. Single source of truth — the backend validates against it and the window builds its forms from it.
// secret: never sent in listings, hidden until revealed. generate: adds a "generate password" button. primary: what quick-copy copies.

const notes = { k: "notes", label: "הערות", kind: "multiline" };

export const TYPES = {
  login: {
    label: "התחברות לאתר",
    plural: "אתרים",
    primary: "password",
    fields: [
      { k: "url", label: "כתובת האתר", kind: "url", ltr: true },
      { k: "username", label: "שם משתמש / מייל", ltr: true },
      { k: "password", label: "סיסמה", secret: true, generate: true, ltr: true },
      { k: "totp", label: "מפתח אימות דו-שלבי (2FA)", secret: true, ltr: true },
      notes,
    ],
  },
  card: {
    label: "כרטיס אשראי",
    plural: "כרטיסים",
    primary: "number",
    fields: [
      { k: "cardholder", label: "שם בעל הכרטיס" },
      { k: "number", label: "מספר כרטיס", secret: true, kind: "card", ltr: true },
      { k: "expiry", label: "תוקף (MM/YY)", ltr: true, placeholder: "08/29" },
      { k: "cvv", label: "CVV", secret: true, ltr: true },
      { k: "pin", label: "קוד סודי", secret: true, ltr: true },
      { k: "issuer", label: "חברת האשראי / הבנק" },
      notes,
    ],
  },
  bank: {
    label: "חשבון בנק",
    plural: "בנקים",
    primary: "account",
    fields: [
      { k: "bank", label: "בנק" },
      { k: "branch", label: "סניף", ltr: true },
      { k: "account", label: "מספר חשבון", secret: true, ltr: true },
      { k: "iban", label: "IBAN", secret: true, ltr: true },
      { k: "username", label: "שם משתמש לאתר הבנק", ltr: true },
      { k: "password", label: "סיסמה לאתר הבנק", secret: true, generate: true, ltr: true },
      notes,
    ],
  },
  identity: {
    label: "מסמך מזהה",
    plural: "מסמכים",
    primary: "idNumber",
    fields: [
      { k: "fullName", label: "שם מלא" },
      { k: "idNumber", label: "תעודת זהות", secret: true, ltr: true },
      { k: "passport", label: "מספר דרכון", secret: true, ltr: true },
      { k: "passportExpiry", label: "תוקף דרכון", ltr: true },
      { k: "license", label: "רישיון נהיגה", secret: true, ltr: true },
      { k: "birthDate", label: "תאריך לידה", ltr: true },
      { k: "phone", label: "טלפון", ltr: true },
      { k: "email", label: "מייל", ltr: true },
      { k: "address", label: "כתובת" },
      notes,
    ],
  },
  wifi: {
    label: "רשת Wi-Fi",
    plural: "רשתות",
    primary: "password",
    fields: [
      { k: "ssid", label: "שם הרשת", ltr: true },
      { k: "password", label: "סיסמה", secret: true, generate: true, ltr: true },
      { k: "security", label: "אבטחה", ltr: true, placeholder: "WPA2 / WPA3" },
      notes,
    ],
  },
  server: {
    label: "שרת / SSH",
    plural: "שרתים",
    primary: "password",
    fields: [
      { k: "host", label: "כתובת", ltr: true },
      { k: "port", label: "פורט", ltr: true, placeholder: "22" },
      { k: "username", label: "משתמש", ltr: true },
      { k: "password", label: "סיסמה", secret: true, generate: true, ltr: true },
      { k: "privateKey", label: "מפתח פרטי", secret: true, kind: "multiline", ltr: true },
      notes,
    ],
  },
  license: {
    label: "רישיון תוכנה",
    plural: "רישיונות",
    primary: "key",
    fields: [
      { k: "product", label: "מוצר" },
      { k: "key", label: "מפתח רישיון", secret: true, ltr: true },
      { k: "email", label: "רשום למייל", ltr: true },
      { k: "version", label: "גרסה", ltr: true },
      notes,
    ],
  },
  note: {
    label: "פתק מאובטח",
    plural: "פתקים",
    primary: "body",
    fields: [{ k: "body", label: "תוכן", secret: true, kind: "multiline" }],
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
    case "bank": return [f.bank, f.branch && `סניף ${f.branch}`].filter(Boolean).join(" · ");
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
