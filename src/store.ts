// The vault file: JSON with a plain header (version, KDF params) and a single encrypted payload.
// Atomic writes (temp file + rename) and a .bak copy of the previous version.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalCode, deriveKey, newKdfParams, open, seal, wipe } from "./crypto.ts";
import { t } from "./i18n.ts";
import type {
  DevEntry,
  Fields,
  ImportedItem,
  Item,
  ItemTypeName,
  ListedDevKey,
  ListedItem,
  MaskedField,
  MaskedItem,
  VaultData,
  VaultFile,
  VaultHeader,
} from "./model.ts";
import { TYPES, subtitle } from "./types.ts";

export interface Session {
  key: Uint8Array;
  data: VaultData;
}

export const HOME = process.env.KV_HOME || path.join(os.homedir(), ".keyvault");
export const VAULT = path.join(HOME, "vault.kv");

export const exists = (): boolean => fs.existsSync(VAULT);

export function readFile(): VaultFile {
  if (!exists()) throw new Error(t("vault.none", { path: VAULT }));
  return JSON.parse(fs.readFileSync(VAULT, "utf8")) as VaultFile;
}

function writeFile(obj: VaultFile): void {
  fs.mkdirSync(HOME, { recursive: true });
  const tmp = `${VAULT}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o600 });
  if (exists()) fs.copyFileSync(VAULT, `${VAULT}.bak`);
  fs.renameSync(tmp, VAULT);
}

const headerOf = (file: VaultFile): VaultHeader => ({ v: file.v, kdf: file.kdf });

export async function create(password: string): Promise<Session> {
  if (exists()) throw new Error(t("vault.exists", { path: VAULT }));
  const header: VaultHeader = { v: 1, kdf: await newKdfParams() };
  const key = await deriveKey(password, header.kdf);
  const data: VaultData = { created: new Date().toISOString(), projects: {}, items: {}, deleted: {} };
  writeFile(await seal(key, data, header));
  return { key, data };
}

export async function unlockWithPassword(password: string): Promise<Session> {
  const file = readFile();
  const key = await deriveKey(password, file.kdf);
  const data = normalize(await open<Partial<VaultData>>(key, file));
  return { key, data };
}

export async function unlockWithKey(key: Uint8Array): Promise<Session> {
  const file = readFile();
  return { key, data: normalize(await open<Partial<VaultData>>(key, file)) };
}

/** Runs after every save — src/sync.ts sets it when a sync folder is configured. Never fails a save. */
type AfterSave = (key: Uint8Array, data: VaultData) => Promise<void>;
let afterSave: AfterSave | null = null;
export const setAfterSave = (fn: AfterSave | null): void => {
  afterSave = fn;
};

export async function save(key: Uint8Array, data: VaultData): Promise<void> {
  await saveQuiet(key, data);
  if (afterSave) await afterSave(key, data).catch(() => {});
}

/** Save without the after-save hook (sync's own write) */
export async function saveQuiet(key: Uint8Array, data: VaultData): Promise<void> {
  const file = readFile();
  writeFile(await seal(key, data, headerOf(file)));
}

/** Replace the vault's header and key — joining a synced vault that has its own master password and salt */
export async function saveAs(header: VaultHeader, key: Uint8Array, data: VaultData): Promise<void> {
  writeFile(await seal(key, data, header));
}

export const header = (): VaultHeader => headerOf(readFile());

export const salt = (): string => readFile().kdf.salt;

// Vaults created before typed items have no `items`. Additive only — the file is unchanged until the next save.
export function normalize(data: Partial<VaultData>): VaultData {
  data.projects ??= {};
  data.items ??= {};
  data.deleted ??= {};
  return data as VaultData;
}

/** Remember a deletion for sync (src/sync.ts) */
const tombstone = (data: VaultData, ref: string) => {
  data.deleted[ref] = new Date().toISOString();
};

// "project/KEY" → ["project", "KEY"]
export function parseRef(ref: string | undefined): [string, string] {
  const i = String(ref || "").indexOf("/");
  if (!ref || i <= 0 || i === ref.length - 1) throw new Error(t("ref.invalid", { ref: String(ref ?? "") }));
  return [ref.slice(0, i), ref.slice(i + 1)];
}

export function getEntry(data: VaultData, project: string, name: string): DevEntry {
  const e = data.projects[project]?.[name];
  if (!e) throw new Error(t("entry.notFound", { ref: `${project}/${name}` }));
  return e;
}

/** Set the default value, or with `env` the value for that environment only */
export function setEntry(data: VaultData, project: string, name: string, value: string, note?: string, env?: string): void {
  data.projects[project] ??= {};
  const prev = data.projects[project][name];
  const now = new Date().toISOString();
  if (env) {
    const entry: DevEntry = prev ?? { value: "", note: note ?? "", updated: now };
    entry.envs = { ...entry.envs, [env]: { value, updated: now } };
    if (note != null) entry.note = note;
    entry.updated = now;
    data.projects[project][name] = entry;
    return;
  }
  data.projects[project][name] = { ...prev, value, note: note ?? prev?.note ?? "", updated: now };
}

/** The value for an environment (its own, else the default); throws if there is none */
export function entryValue(data: VaultData, project: string, name: string, env?: string): string {
  const e = getEntry(data, project, name);
  const v = (env && e.envs?.[env]?.value) || e.value;
  if (!v) throw new Error(t("entry.noValue", { ref: `${project}/${name}`, env: env ?? "default" }));
  return v;
}

/** Every key of a project with a value for this environment — what `kv run` and `kv env` inject */
export function projectValues(data: VaultData, project: string, env?: string): Record<string, string> {
  const keys = data.projects[project];
  if (!keys) throw new Error(t("cli.noProject", { name: project }));
  const out: Record<string, string> = {};
  for (const [k, e] of Object.entries(keys)) {
    const v = (env && e.envs?.[env]?.value) || e.value;
    if (v) out[k] = v;
  }
  return out;
}

/** Delete a key, or with `env` only that environment's value */
export function deleteEntry(data: VaultData, project: string, name: string, env?: string): void {
  const e = getEntry(data, project, name);
  if (env) {
    if (!e.envs?.[env]) throw new Error(t("entry.notFound", { ref: `${project}/${name} --env ${env}` }));
    delete e.envs[env];
    if (!Object.keys(e.envs).length) delete e.envs;
    if (e.value || e.envs) return;
  }
  delete data.projects[project]![name];
  if (!Object.keys(data.projects[project]!).length) delete data.projects[project];
  tombstone(data, `dev:${project}/${name}`);
}

/** project/KEY → project/KEY (also across projects) */
export function renameEntry(data: VaultData, from: [string, string], to: [string, string]): void {
  const e = getEntry(data, from[0], from[1]);
  if (data.projects[to[0]]?.[to[1]]) throw new Error(t("entry.exists", { ref: `${to[0]}/${to[1]}` }));
  data.projects[to[0]] ??= {};
  data.projects[to[0]][to[1]] = { ...e, updated: new Date().toISOString() };
  delete data.projects[from[0]]![from[1]];
  if (!Object.keys(data.projects[from[0]]!).length) delete data.projects[from[0]];
  tombstone(data, `dev:${from[0]}/${from[1]}`);
}

export function renameProject(data: VaultData, from: string, to: string): void {
  if (!data.projects[from]) throw new Error(t("cli.noProject", { name: from }));
  if (data.projects[to]) throw new Error(t("project.exists", { name: to }));
  const now = new Date().toISOString();
  data.projects[to] = Object.fromEntries(Object.entries(data.projects[from]).map(([k, e]) => [k, { ...e, updated: now }]));
  for (const k of Object.keys(data.projects[from])) tombstone(data, `dev:${from}/${k}`);
  delete data.projects[from];
}

// Listing without values — safe to display
export function listing(data: VaultData): Record<string, ListedDevKey[]> {
  const out: Record<string, ListedDevKey[]> = {};
  for (const [p, keys] of Object.entries(data.projects)) {
    out[p] = Object.entries(keys)
      .map(([k, e]) => ({ key: k, note: e.note, updated: e.updated, ...(e.envs ? { envs: Object.keys(e.envs).sort() } : {}) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
  return out;
}

// ── Typed items (login, card, bank, ...) ──
// { id, type, title, fields: {k: string}, fav, created, updated }

const MAX_FIELD = 20_000;

// Listing without secret fields — title and subtitle only
export function listItems(data: VaultData): ListedItem[] {
  return Object.values(data.items)
    .map((it) => ({ id: it.id, type: it.type, title: it.title, sub: subtitle(it), fav: !!it.fav, updated: it.updated }))
    .sort((a, b) => a.title.localeCompare(b.title, "he"));
}

export function getItem(data: VaultData, id: string): Item {
  const it = data.items[String(id)];
  if (!it) throw new Error(t("item.notFound"));
  return it;
}

// The item with secret fields masked: { k: { secret: true } }
export function maskedItem(data: VaultData, id: string): MaskedItem {
  const it = getItem(data, id);
  const fields: Record<string, MaskedField> = {};
  for (const f of TYPES[it.type].fields) {
    const v = it.fields[f.k];
    if (v == null || v === "") continue;
    fields[f.k] = f.secret ? { secret: true } : v;
  }
  return { ...it, fields };
}

export function itemValue(data: VaultData, id: string, k: string): string {
  const it = getItem(data, id);
  const v = it.fields[String(k)];
  if (v == null || v === "") throw new Error(t("item.fieldEmpty"));
  return v;
}

export function saveItem(data: VaultData, input: { id?: string; type?: string; title?: string; fields?: Partial<Fields> }): string {
  const prev = input.id ? getItem(data, input.id) : null;
  const type = (prev ? prev.type : String(input.type || "")) as ItemTypeName;
  // Params come from the window (JSON), so the type is checked at runtime too
  const def = Object.hasOwn(TYPES, type) ? TYPES[type] : undefined;
  if (!def) throw new Error(t("item.unknownType", { type }));
  const title = String(input.title || "").trim();
  if (!title) throw new Error(t("item.noTitle"));
  const fields = input.fields;
  const clean: Fields = {};
  for (const f of def.fields) {
    const v = fields?.[f.k];
    if (v == null) continue;
    const str = String(v);
    if (str.length > MAX_FIELD) throw new Error(t("item.tooLong", { field: f.label.en }));
    if (str.trim() !== "") clean[f.k] = f.kind === "multiline" ? str : str.trim();
  }
  const now = new Date().toISOString();
  const item: Item = { id: prev?.id || randomUUID(), type, title, fields: clean, fav: prev?.fav || false, created: prev?.created || now, updated: now };
  data.items[item.id] = item;
  return item.id;
}

export function setFav(data: VaultData, id: string, fav: boolean): void {
  const it = getItem(data, id);
  it.fav = !!fav;
  it.favAt = new Date().toISOString();
}

export function deleteItem(data: VaultData, id: string): void {
  getItem(data, id);
  delete data.items[String(id)];
  tombstone(data, `item:${id}`);
}

// Bulk import (browser CSV, 1Password, Bitwarden, KeePass). An entry identical to an existing item is skipped:
// for logins the same URL, username and password; for other types the same title and fields.
// An entry the vault can't hold (a field over the size limit) is counted as invalid; the rest still go in. Counts only.
export function importItems(data: VaultData, incoming: ImportedItem[]): { added: number; duplicates: number; invalid: number } {
  const sig = (it: { type: ItemTypeName; title: string; fields: Fields }) =>
    JSON.stringify(
      it.type === "login"
        ? ["login", it.fields.url || "", it.fields.username || "", it.fields.password || ""]
        : [it.type, it.title, Object.entries(it.fields).sort(([a], [b]) => a.localeCompare(b))],
    );
  const seen = new Set(Object.values(data.items).map(sig));
  let added = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const it of incoming) {
    let id: string;
    try {
      id = saveItem(data, { type: it.type, title: it.title, fields: it.fields });
    } catch {
      invalid++;
      continue;
    }
    const key = sig(data.items[id]!); // after saveItem's trimming, so re-imports match
    if (seen.has(key)) {
      delete data.items[id];
      duplicates++;
      continue;
    }
    seen.add(key);
    added++;
  }
  return { added, duplicates, invalid };
}

/** Add dev keys someone shared. An existing key is never overwritten — it's counted as skipped. */
export function addSharedDev(data: VaultData, dev: { project: string; key: string; value: string; note: string }[]): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  for (const d of dev) {
    if (data.projects[d.project]?.[d.key]) {
      skipped++;
      continue;
    }
    setEntry(data, d.project, d.key, d.value, d.note);
    added++;
  }
  return { added, skipped };
}

// ── Emergency export ──
// The same file format as the vault, sealed under a separate password (or a recovery code) with fresh KDF
// parameters. A snapshot: it does not follow later changes. `kv restore` turns it back into a vault.

export async function exportTo(file: string, data: VaultData, password: string): Promise<void> {
  if (!password) throw new Error(t("pw.empty"));
  const header: VaultHeader = { v: 1, kdf: await newKdfParams() };
  const key = await deriveKey(password, header.kdf);
  try {
    const sealed = await seal(key, data, header);
    // wx: create only — an existing file is never overwritten (no separate exists check to race with)
    fs.writeFileSync(file, JSON.stringify(sealed, null, 1), { mode: 0o600, flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(t("export.exists", { path: file }));
    throw e;
  } finally {
    await wipe(key);
  }
}

/**
 * Open an export (or any vault file) with its password or recovery code. The secret is tried as typed first;
 * then, if it differs, in a recovery code's canonical form — a code may be typed in lower case or without dashes.
 */
export async function openExport(file: string, secret: string): Promise<VaultData> {
  let sealed: VaultFile;
  try {
    sealed = JSON.parse(fs.readFileSync(file, "utf8")) as VaultFile;
  } catch {
    throw new Error(t("export.notExport", { path: file }));
  }
  if (!sealed || typeof sealed !== "object" || !sealed.kdf || !sealed.ct || !sealed.nonce) throw new Error(t("export.notExport", { path: file }));
  const attempt = async (pw: string) => {
    const key = await deriveKey(pw, sealed.kdf);
    try {
      return normalize(await open<Partial<VaultData>>(key, sealed));
    } finally {
      await wipe(key);
    }
  };
  try {
    return await attempt(secret);
  } catch (e) {
    if (canonicalCode(secret) === secret) throw e;
    return attempt(canonicalCode(secret));
  }
}
