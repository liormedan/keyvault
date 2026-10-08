// Read a password-manager or browser export into items. The format is recognised from the content, not the name:
//   CSV (Chrome, Edge, Firefox, Safari, LastPass, 1Password CSV, Bitwarden CSV) — src/import-csv.ts
//   1Password .1pux (a zip with export.data) · Bitwarden .json (unencrypted) · KeePass 2 .xml
// Exports are plaintext: values are parsed in memory and never logged or echoed. Secret extra fields
// (concealed / hidden / protected) go into a secure note next to the item, never into its plain notes.
import fs from "node:fs";
import { t } from "./i18n.ts";
import { csvToLogins } from "./import-csv.ts";
import type { Fields, ImportedItem } from "./model.ts";
import { readZipEntry } from "./unzip.ts";

export type ImportFormat = "CSV" | "1Password" | "Bitwarden" | "KeePass";

export interface ImportParse {
  format: ImportFormat;
  items: ImportedItem[];
  /** entries with nothing to keep: logins without a password, empty notes */
  skipped: number;
}

const MAX_TEXT = 20 * 1024 * 1024;
const MAX_ZIP = 200 * 1024 * 1024;

const clean = (f: Record<string, string | undefined>): Fields =>
  Object.fromEntries(Object.entries(f).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== ""));

const lines = (pairs: [string, string][]): string => pairs.map(([k, v]) => (k ? `${k}: ${v}` : v)).join("\n");

const expiry = (month: unknown, year: unknown): string | undefined => {
  const m = String(month ?? "").trim();
  const y = String(year ?? "").trim();
  if (!m || !y) return undefined;
  return `${m.padStart(2, "0")}/${y.slice(-2)}`;
};

/**
 * Turn one parsed entry into items. A login needs a password; anything else needs some content.
 * `secretExtras` become a secure note "<title> — extra fields" so they stay hidden.
 */
function collect(
  out: ImportedItem[],
  entry: {
    type: ImportedItem["type"];
    title: string;
    fields: Record<string, string | undefined>;
    extras?: [string, string][];
    secretExtras?: [string, string][];
  },
): boolean {
  const fields = clean(entry.fields);
  const extras = (entry.extras ?? []).filter(([, v]) => v.trim());
  if (extras.length) fields.notes = [fields.notes, lines(extras)].filter(Boolean).join("\n\n");
  const title = entry.title.trim() || t("import.untitled");
  if (entry.type === "login" ? !fields.password : !Object.keys(fields).length) return false;
  out.push({ type: entry.type, title, fields });
  const secret = (entry.secretExtras ?? []).filter(([, v]) => v.trim());
  if (secret.length) out.push({ type: "note", title: t("import.extraFields", { title }), fields: { body: lines(secret) } });
  return true;
}

// ── Bitwarden (unencrypted JSON) ──

interface BwField {
  name?: string;
  value?: string | null;
  type?: number;
}
interface BwItem {
  type?: number;
  name?: string;
  notes?: string | null;
  fields?: BwField[];
  login?: { username?: string | null; password?: string | null; totp?: string | null; uris?: { uri?: string | null }[] | null };
  card?: {
    cardholderName?: string | null;
    brand?: string | null;
    number?: string | null;
    expMonth?: string | null;
    expYear?: string | null;
    code?: string | null;
  };
  identity?: Record<string, string | null | undefined>;
}

export function fromBitwarden(json: { encrypted?: boolean; items?: BwItem[] }): ImportParse {
  if (json.encrypted) throw new Error(t("import.encrypted"));
  if (!Array.isArray(json.items)) throw new Error(t("import.unknown"));
  const items: ImportedItem[] = [];
  let skipped = 0;
  for (const it of json.items) {
    const custom = (it.fields ?? []).filter((f) => f.value != null && f.type !== 3);
    const extras = custom.filter((f) => f.type !== 1).map((f): [string, string] => [f.name ?? "", String(f.value)]);
    const secretExtras = custom.filter((f) => f.type === 1).map((f): [string, string] => [f.name ?? "", String(f.value)]);
    const notes = it.notes ?? undefined;
    const title = it.name ?? "";
    let ok: boolean;
    if (it.type === 1) {
      const l = it.login ?? {};
      ok = collect(items, {
        type: "login",
        title,
        fields: { url: l.uris?.[0]?.uri ?? undefined, username: l.username ?? undefined, password: l.password ?? undefined, totp: l.totp ?? undefined, notes },
        extras,
        secretExtras,
      });
    } else if (it.type === 3) {
      const c = it.card ?? {};
      ok = collect(items, {
        type: "card",
        title,
        fields: {
          cardholder: c.cardholderName ?? undefined,
          number: c.number ?? undefined,
          cvv: c.code ?? undefined,
          expiry: expiry(c.expMonth, c.expYear),
          issuer: c.brand ?? undefined,
          notes,
        },
        extras,
        secretExtras,
      });
    } else if (it.type === 4) {
      const i = it.identity ?? {};
      const join = (keys: string[], sep: string) =>
        keys
          .map((k) => i[k] ?? "")
          .filter(Boolean)
          .join(sep) || undefined;
      ok = collect(items, {
        type: "identity",
        title,
        fields: {
          fullName: join(["title", "firstName", "middleName", "lastName"], " "),
          idNumber: i.ssn ?? undefined,
          passport: i.passportNumber ?? undefined,
          license: i.licenseNumber ?? undefined,
          email: i.email ?? undefined,
          phone: i.phone ?? undefined,
          address: join(["address1", "address2", "address3", "city", "state", "postalCode", "country"], ", "),
          notes,
        },
        extras,
        secretExtras,
      });
    } else {
      // 2 = secure note; anything newer is kept as a note too
      ok = collect(items, { type: "note", title, fields: { body: [notes, lines([...extras, ...secretExtras])].filter(Boolean).join("\n\n") } });
    }
    if (!ok) skipped++;
  }
  return { format: "Bitwarden", items, skipped };
}

// ── KeePass 2 (XML export) ──

const decodeXml = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "amp") return "&";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const code = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });

const STANDARD = new Set([
  "Title",
  "UserName",
  "Password",
  "URL",
  "Notes",
  "otp",
  "TOTP Seed",
  "TOTP Settings",
  "TimeOtp-Secret-Base32",
  "TimeOtp-Period",
  "TimeOtp-Length",
]);

export function fromKeePass(xml: string): ImportParse {
  if (!/<KeePassFile[\s>]/.test(xml)) throw new Error(t("import.unknown"));
  const bin = /<RecycleBinUUID>([^<]*)<\/RecycleBinUUID>/.exec(xml)?.[1]?.trim();
  // Old versions of each entry live in <History>; only the current one is imported
  const body = xml.replace(/<History>[\s\S]*?<\/History>/g, "");
  const items: ImportedItem[] = [];
  let skipped = 0;
  const groups: string[] = [];
  const tag = /<(\/?)(Group|Entry)\b[^>]*>/g;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    if (m[2] === "Group") {
      if (m[1]) groups.pop();
      else groups.push(/^\s*<UUID>([^<]*)<\/UUID>/.exec(body.slice(tag.lastIndex))?.[1]?.trim() ?? "");
      continue;
    }
    if (m[1]) continue;
    const end = body.indexOf("</Entry>", tag.lastIndex);
    if (end < 0) break;
    const entry = body.slice(tag.lastIndex, end);
    tag.lastIndex = end + 8;
    if (bin && groups.includes(bin)) continue; // in the recycle bin
    const strings = new Map<string, { value: string; protected: boolean }>();
    for (const s of entry.matchAll(/<String>\s*<Key>([^<]*)<\/Key>\s*(?:<Value([^>]*)\/>|<Value([^>]*)>([\s\S]*?)<\/Value>)\s*<\/String>/g)) {
      const attrs = s[2] ?? s[3] ?? "";
      strings.set(decodeXml(s[1]!), { value: decodeXml(s[4] ?? ""), protected: /ProtectInMemory="True"/i.test(attrs) });
    }
    const get = (k: string) => strings.get(k)?.value || undefined;
    const others = [...strings].filter(([k, v]) => !STANDARD.has(k) && v.value);
    const otp = get("otp") ?? get("TimeOtp-Secret-Base32") ?? get("TOTP Seed");
    const fields = { url: get("URL"), username: get("UserName"), password: get("Password"), totp: otp, notes: get("Notes") };
    const extras = others.filter(([, v]) => !v.protected).map(([k, v]): [string, string] => [k, v.value]);
    const secretExtras = others.filter(([, v]) => v.protected).map(([k, v]): [string, string] => [k, v.value]);
    const title = get("Title") ?? "";
    const ok = fields.password
      ? collect(items, { type: "login", title, fields, extras, secretExtras })
      : collect(items, {
          type: "note",
          title,
          fields: { body: lines([...Object.entries(fields).filter((e): e is [string, string] => !!e[1]), ...extras, ...secretExtras]) },
        });
    if (!ok) skipped++;
  }
  return { format: "KeePass", items, skipped };
}

// ── 1Password (.1pux) ──

type OpValue = Record<string, unknown>;
interface OpField {
  title?: string;
  id?: string;
  value?: OpValue;
}
interface OpItem {
  state?: string;
  categoryUuid?: string;
  overview?: { title?: string; url?: string; urls?: { url?: string }[] };
  details?: {
    loginFields?: { value?: string; designation?: string; fieldType?: string }[];
    notesPlain?: string;
    password?: string;
    sections?: { fields?: OpField[] }[];
  };
}

/** A section field's value as text, and whether 1Password treats it as secret */
function opValue(v: OpValue | undefined): { text: string; secret: boolean } | null {
  if (!v) return null;
  const [kind, raw] = Object.entries(v)[0] ?? [];
  if (raw == null || raw === "") return null;
  const secret = kind === "concealed" || kind === "totp" || kind === "creditCardNumber";
  if (kind === "monthYear" && typeof raw === "number") {
    const s = String(raw);
    return { text: `${s.slice(4, 6)}/${s.slice(2, 4)}`, secret };
  }
  if (kind === "date" && typeof raw === "number") return { text: new Date(raw * 1000).toISOString().slice(0, 10), secret };
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return { text: String(raw), secret };
  if (kind === "email" && typeof raw === "object" && raw && "email_address" in raw)
    return { text: String((raw as { email_address: unknown }).email_address), secret };
  if (kind === "address" && typeof raw === "object" && raw) return { text: Object.values(raw).filter(Boolean).join(", "), secret };
  if (kind === "sshKey" && typeof raw === "object" && raw && "privateKey" in raw)
    return { text: String((raw as { privateKey: unknown }).privateKey), secret: true };
  return null;
}

const CARD_IDS: Record<string, string> = { cardholder: "cardholder", ccnum: "number", cvv: "cvv", expiry: "expiry", pin: "pin", bank: "issuer" };

export function from1Password(zip: Buffer): ImportParse {
  let data: Buffer | null;
  try {
    data = readZipEntry(zip, "export.data");
  } catch {
    throw new Error(t("import.badZip"));
  }
  if (!data) throw new Error(t("import.badZip"));
  let json: { accounts?: { vaults?: { items?: OpItem[] }[] }[] };
  try {
    json = JSON.parse(data.toString("utf8"));
  } catch {
    throw new Error(t("import.badZip"));
  }
  const items: ImportedItem[] = [];
  let skipped = 0;
  for (const account of json.accounts ?? []) {
    for (const vault of account.vaults ?? []) {
      for (const it of vault.items ?? []) {
        if (it.state && it.state !== "active") continue; // archived or deleted
        const d = it.details ?? {};
        const o = it.overview ?? {};
        const title = o.title ?? "";
        const sectionFields = (d.sections ?? []).flatMap((s) => s.fields ?? []);
        let totp: string | undefined;
        const card: Record<string, string> = {};
        const extras: [string, string][] = [];
        const secretExtras: [string, string][] = [];
        const cat = it.categoryUuid;
        for (const f of sectionFields) {
          const v = opValue(f.value);
          if (!v) continue;
          if (f.value && "totp" in f.value && !totp) {
            totp = v.text;
            continue;
          }
          if (cat === "002" && f.id && CARD_IDS[f.id]) {
            card[CARD_IDS[f.id]!] = v.text;
            continue;
          }
          (v.secret ? secretExtras : extras).push([f.title || f.id || "", v.text]);
        }
        let ok: boolean;
        if (cat === "001" || cat === "005") {
          const lf = d.loginFields ?? [];
          const username = lf.find((f) => f.designation === "username")?.value;
          const password = lf.find((f) => f.designation === "password")?.value ?? d.password;
          const url = o.url || o.urls?.[0]?.url;
          ok = collect(items, { type: "login", title, fields: { url, username, password, totp, notes: d.notesPlain }, extras, secretExtras });
        } else if (cat === "002") {
          ok = collect(items, { type: "card", title, fields: { ...card, notes: d.notesPlain }, extras, secretExtras });
        } else {
          // Secure notes and every other category: the whole thing becomes a secure note
          ok = collect(items, {
            type: "note",
            title,
            fields: { body: [d.notesPlain, lines([...extras, ...secretExtras]), totp ? `TOTP: ${totp}` : ""].filter(Boolean).join("\n\n") },
          });
        }
        if (!ok) skipped++;
      }
    }
  }
  return { format: "1Password", items, skipped };
}

// ── Any export ──

export function parseImport(buf: Buffer): ImportParse {
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return from1Password(buf);
  if (buf.length > MAX_TEXT) throw new Error(t("import.tooBig"));
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const head = text.trimStart();
  if (head.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(head);
    } catch {
      throw new Error(t("import.unknown"));
    }
    return fromBitwarden(json as { encrypted?: boolean; items?: BwItem[] });
  }
  if (head.startsWith("<")) return fromKeePass(head);
  const { logins, skipped } = csvToLogins(text);
  return { format: "CSV", items: logins, skipped };
}

export function readImportFile(file: string): ImportParse {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    throw new Error(t("import.notFound"));
  }
  if (!st.isFile()) throw new Error(t("import.notFile"));
  if (st.size > MAX_ZIP) throw new Error(t("import.tooBig"));
  return parseImport(fs.readFileSync(file));
}
