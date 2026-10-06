// The vault file: JSON with a plain header (version, KDF params) and a single encrypted payload.
// Atomic writes (temp file + rename) and a .bak copy of the previous version.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deriveKey, newKdfParams, open, seal } from "./crypto.ts";
import { t } from "./i18n.ts";
import type {
  DevEntry,
  Fields,
  ImportedLogin,
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
  const data: VaultData = { created: new Date().toISOString(), projects: {}, items: {} };
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

export async function save(key: Uint8Array, data: VaultData): Promise<void> {
  const file = readFile();
  writeFile(await seal(key, data, headerOf(file)));
}

export const salt = (): string => readFile().kdf.salt;

// Vaults created before typed items have no `items`. Additive only — the file is unchanged until the next save.
function normalize(data: Partial<VaultData>): VaultData {
  data.projects ??= {};
  data.items ??= {};
  return data as VaultData;
}

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
}

/** project/KEY → project/KEY (also across projects) */
export function renameEntry(data: VaultData, from: [string, string], to: [string, string]): void {
  const e = getEntry(data, from[0], from[1]);
  if (data.projects[to[0]]?.[to[1]]) throw new Error(t("entry.exists", { ref: `${to[0]}/${to[1]}` }));
  data.projects[to[0]] ??= {};
  data.projects[to[0]][to[1]] = e;
  delete data.projects[from[0]]![from[1]];
  if (!Object.keys(data.projects[from[0]]!).length) delete data.projects[from[0]];
}

export function renameProject(data: VaultData, from: string, to: string): void {
  if (!data.projects[from]) throw new Error(t("cli.noProject", { name: from }));
  if (data.projects[to]) throw new Error(t("project.exists", { name: to }));
  data.projects[to] = data.projects[from];
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
  getItem(data, id).fav = !!fav;
}

export function deleteItem(data: VaultData, id: string): void {
  getItem(data, id);
  delete data.items[String(id)];
}

// Bulk import of logins (browser CSV). An entry identical to an existing login
// (same URL, username and password) is skipped. Returns counts only.
export function importLogins(data: VaultData, logins: ImportedLogin[]): { added: number; duplicates: number } {
  const sig = (f: Fields) => `${f.url || ""}\n${f.username || ""}\n${f.password || ""}`;
  const seen = new Set(
    Object.values(data.items)
      .filter((it) => it.type === "login")
      .map((it) => sig(it.fields)),
  );
  let added = 0;
  let duplicates = 0;
  for (const l of logins) {
    const key = sig(l.fields);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    saveItem(data, { type: "login", title: l.title, fields: l.fields });
    seen.add(key);
    added++;
  }
  return { added, duplicates };
}
