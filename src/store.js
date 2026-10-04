// The vault file: JSON with a plain header (version, KDF params) and a single encrypted payload.
// Atomic writes (temp file + rename) and a .bak copy of the previous version.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deriveKey, newKdfParams, open, seal } from "./crypto.js";
import { TYPES, subtitle } from "./types.js";

export const HOME = process.env.KV_HOME || path.join(os.homedir(), ".keyvault");
export const VAULT = path.join(HOME, "vault.kv");

export const exists = () => fs.existsSync(VAULT);

export function readFile() {
  if (!exists()) throw new Error(`אין כספת ב-${VAULT}. הרץ: kv init`);
  return JSON.parse(fs.readFileSync(VAULT, "utf8"));
}

function writeFile(obj) {
  fs.mkdirSync(HOME, { recursive: true });
  const tmp = `${VAULT}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o600 });
  if (exists()) fs.copyFileSync(VAULT, `${VAULT}.bak`);
  fs.renameSync(tmp, VAULT);
}

const headerOf = (file) => ({ v: file.v, kdf: file.kdf });

export async function create(password) {
  if (exists()) throw new Error(`כבר קיימת כספת ב-${VAULT}`);
  const header = { v: 1, kdf: await newKdfParams() };
  const key = await deriveKey(password, header.kdf);
  const data = { created: new Date().toISOString(), projects: {}, items: {} };
  writeFile(await seal(key, data, header));
  return { key, data };
}

export async function unlockWithPassword(password) {
  const file = readFile();
  const key = await deriveKey(password, file.kdf);
  const data = normalize(await open(key, file));
  return { key, data };
}

export async function unlockWithKey(key) {
  const file = readFile();
  return { key, data: normalize(await open(key, file)) };
}

export async function save(key, data) {
  const file = readFile();
  writeFile(await seal(key, data, headerOf(file)));
}

export const salt = () => readFile().kdf.salt;

// Vaults created before typed items have no `items`. Additive only — the file is unchanged until the next save.
function normalize(data) {
  data.projects ??= {};
  data.items ??= {};
  return data;
}

// "project/KEY" → ["project", "KEY"]
export function parseRef(ref) {
  const i = String(ref || "").indexOf("/");
  if (i <= 0 || i === ref.length - 1) throw new Error(`שם לא תקין: "${ref}". הצורה: פרויקט/מפתח, למשל my-app/API_KEY`);
  return [ref.slice(0, i), ref.slice(i + 1)];
}

export function getEntry(data, project, name) {
  const e = data.projects[project]?.[name];
  if (!e) throw new Error(`לא נמצא: ${project}/${name}`);
  return e;
}

export function setEntry(data, project, name, value, note) {
  data.projects[project] ??= {};
  const prev = data.projects[project][name];
  data.projects[project][name] = { value, note: note ?? prev?.note ?? "", updated: new Date().toISOString() };
}

export function deleteEntry(data, project, name) {
  getEntry(data, project, name);
  delete data.projects[project][name];
  if (!Object.keys(data.projects[project]).length) delete data.projects[project];
}

// Listing without values — safe to display
export function listing(data) {
  const out = {};
  for (const [p, keys] of Object.entries(data.projects)) {
    out[p] = Object.entries(keys)
      .map(([k, e]) => ({ key: k, note: e.note, updated: e.updated }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
  return out;
}

// ── Typed items (login, card, bank, ...) ──
// { id, type, title, fields: {k: string}, fav, created, updated }

const MAX_FIELD = 20_000;

// Listing without secret fields — title and subtitle only
export function listItems(data) {
  return Object.values(data.items)
    .map((it) => ({ id: it.id, type: it.type, title: it.title, sub: subtitle(it), fav: !!it.fav, updated: it.updated }))
    .sort((a, b) => a.title.localeCompare(b.title, "he"));
}

export function getItem(data, id) {
  const it = data.items[String(id)];
  if (!it) throw new Error("הפריט לא נמצא");
  return it;
}

// The item with secret fields masked: { k: { secret: true } }
export function maskedItem(data, id) {
  const it = getItem(data, id);
  const fields = {};
  for (const f of TYPES[it.type].fields) {
    const v = it.fields[f.k];
    if (v == null || v === "") continue;
    fields[f.k] = f.secret ? { secret: true } : v;
  }
  return { ...it, fields };
}

export function itemValue(data, id, k) {
  const it = getItem(data, id);
  const v = it.fields[String(k)];
  if (v == null || v === "") throw new Error("השדה ריק");
  return v;
}

export function saveItem(data, { id, type, title, fields }) {
  const prev = id ? getItem(data, id) : null;
  type = prev ? prev.type : String(type || "");
  const def = TYPES[type];
  if (!def) throw new Error(`סוג לא מוכר: ${type}`);
  title = String(title || "").trim();
  if (!title) throw new Error("חסרה כותרת");
  const clean = {};
  for (const f of def.fields) {
    const v = fields?.[f.k];
    if (v == null) continue;
    const str = String(v);
    if (str.length > MAX_FIELD) throw new Error(`${f.label}: ארוך מדי`);
    if (str.trim() !== "") clean[f.k] = f.kind === "multiline" ? str : str.trim();
  }
  const now = new Date().toISOString();
  const item = { id: prev?.id || randomUUID(), type, title, fields: clean, fav: prev?.fav || false, created: prev?.created || now, updated: now };
  data.items[item.id] = item;
  return item.id;
}

export function setFav(data, id, fav) {
  getItem(data, id).fav = !!fav;
}

export function deleteItem(data, id) {
  getItem(data, id);
  delete data.items[String(id)];
}
